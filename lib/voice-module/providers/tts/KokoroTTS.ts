import type { KokoroTTS as KokoroEngineModel } from 'kokoro-js'
import { describeVoiceDebugText, recordVoiceDebugEvent } from '@/lib/voice-debug/client'
import type { TTSProvider } from './TTSProvider'

type KokoroGenerateOptions = NonNullable<Parameters<KokoroEngineModel['generate']>[1]>
type KokoroVoice = NonNullable<KokoroGenerateOptions['voice']>
type KokoroDType = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
type KokoroDevice = 'wasm' | 'webgpu' | 'cpu' | null

interface KokoroLoadStrategy {
  device: KokoroDevice
  dtype: KokoroDType
}

interface KokoroTTSConfig {
  voice?: KokoroVoice
  dtype?: KokoroDType
  modelId?: string
  device?: KokoroDevice | 'auto'
  webgpuDtype?: KokoroDType
  onLoadingChange?: (loading: boolean) => void
}

export class KokoroTTS implements TTSProvider {
  private static readonly PLAYBACK_TIMEOUT_MS = 45000

  private config: Required<KokoroTTSConfig>
  private model: KokoroEngineModel | null = null
  private loading: Promise<KokoroEngineModel> | null = null
  private activeStrategy: KokoroLoadStrategy | null = null
  private currentAudio: HTMLAudioElement | null = null
  private currentObjectUrl: string | null = null
  private speaking = false
  private requestId = 0

  constructor(config: KokoroTTSConfig = {}) {
    this.config = {
      // kokoro-js@1.2.1 ships only en-us / en-gb voices. af_bella sounded best for dev use.
      voice: config.voice ?? 'af_bella',
      dtype: config.dtype ?? 'q4',
      modelId: config.modelId ?? 'onnx-community/Kokoro-82M-v1.0-ONNX',
      device: config.device ?? 'auto',
      webgpuDtype: config.webgpuDtype ?? 'fp32',
      onLoadingChange: config.onLoadingChange ?? (() => undefined),
    }
  }

  async prepare(): Promise<void> {
    await this.ensureModel()
  }

  async speak(text: string): Promise<void> {
    const content = text.trim()
    if (!content) return

    this.stop()
    recordVoiceDebugEvent('tts.kokoro.speak.request', {
      voice: this.config.voice,
      dtype: this.activeStrategy?.dtype ?? this.config.dtype,
      device: this.config.device ?? 'auto',
      ...describeVoiceDebugText(content),
    })

    const model = await this.ensureModel()
    recordVoiceDebugEvent('tts.kokoro.generate.start', describeVoiceDebugText(content))
    const audio = await model.generate(content, {
      voice: this.config.voice,
    })
    const sampleCount = typeof audio === 'object'
      && audio !== null
      && 'audio' in audio
      && audio.audio instanceof Float32Array
      ? audio.audio.length
      : undefined
    const samplingRate = typeof audio === 'object'
      && audio !== null
      && 'sampling_rate' in audio
      && typeof audio.sampling_rate === 'number'
      ? audio.sampling_rate
      : undefined
    recordVoiceDebugEvent('tts.kokoro.generate.success', {
      samplingRate,
      samples: sampleCount,
      ...describeVoiceDebugText(content),
    })
    const blob = audio.toBlob()
    await this.playBlob(blob)
    recordVoiceDebugEvent('tts.kokoro.speak.ended', describeVoiceDebugText(content))
  }

  stop(): void {
    this.requestId += 1
    this.speaking = false
    recordVoiceDebugEvent('tts.kokoro.stop', {})

    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.src = ''
      this.currentAudio = null
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }
  }

  isSpeaking(): boolean {
    return this.speaking
  }

  private async ensureModel(): Promise<KokoroEngineModel> {
    if (this.model) {
      return this.model
    }

    if (!this.loading) {
      this.config.onLoadingChange(true)
      recordVoiceDebugEvent('tts.kokoro.model.load.start', {
        modelId: this.config.modelId,
        dtype: this.config.dtype,
        device: this.config.device ?? 'auto',
      })
      this.loading = (async () => {
        const { KokoroTTS: KokoroEngine } = await import('kokoro-js')
        const strategies = await this.resolveLoadStrategies()
        let lastError: unknown = null

        for (const strategy of strategies) {
          recordVoiceDebugEvent('tts.kokoro.model.load.attempt', {
            modelId: this.config.modelId,
            dtype: strategy.dtype,
            device: strategy.device ?? 'auto',
          })

          try {
            this.model = await KokoroEngine.from_pretrained(this.config.modelId, {
              dtype: strategy.dtype,
              device: strategy.device,
            })
            this.activeStrategy = strategy
            recordVoiceDebugEvent('tts.kokoro.model.load.success', {
              modelId: this.config.modelId,
              voiceCount: Object.keys(this.model.voices).length,
              dtype: strategy.dtype,
              device: strategy.device ?? 'auto',
            })
            return this.model
          } catch (error) {
            lastError = error
            recordVoiceDebugEvent('tts.kokoro.model.load.attempt.error', {
              modelId: this.config.modelId,
              dtype: strategy.dtype,
              device: strategy.device ?? 'auto',
              message: error instanceof Error ? error.message : String(error),
            })
          }
        }

        throw lastError instanceof Error ? lastError : new Error('Kokoro model load failed')
      })()
        .catch(error => {
          recordVoiceDebugEvent('tts.kokoro.model.load.error', {
            modelId: this.config.modelId,
            message: error instanceof Error ? error.message : String(error),
          })
          throw error
        })
        .finally(() => {
          this.config.onLoadingChange(false)
        })
    }

    return this.loading
  }

  private async resolveLoadStrategies(): Promise<KokoroLoadStrategy[]> {
    if (this.config.device !== 'auto') {
      return [{
        device: this.config.device,
        dtype: this.config.dtype,
      }]
    }

    const strategies: KokoroLoadStrategy[] = []

    if (await this.supportsWebGpu()) {
      strategies.push({
        device: 'webgpu',
        dtype: this.config.webgpuDtype,
      })
    }

    strategies.push({
      device: 'wasm',
      dtype: this.config.dtype,
    })

    return strategies
  }

  private async supportsWebGpu(): Promise<boolean> {
    if (typeof navigator === 'undefined') {
      return false
    }

    const webGpuNavigator = navigator as Navigator & {
      gpu?: {
        requestAdapter?: () => Promise<unknown>
      }
    }

    if (typeof webGpuNavigator.gpu?.requestAdapter !== 'function') {
      return false
    }

    try {
      return Boolean(await webGpuNavigator.gpu.requestAdapter())
    } catch {
      return false
    }
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const requestId = this.requestId + 1
      this.requestId = requestId

      const objectUrl = URL.createObjectURL(blob)
      const audio = new Audio(objectUrl)
      this.currentObjectUrl = objectUrl
      this.currentAudio = audio
      this.speaking = true
      recordVoiceDebugEvent('tts.kokoro.audio.play.start', {
        size: blob.size,
        type: blob.type,
      })

      const timeoutId = window.setTimeout(() => {
        finalize(() => {
          recordVoiceDebugEvent('tts.kokoro.audio.play.timeout', {
            timeoutMs: KokoroTTS.PLAYBACK_TIMEOUT_MS,
          })
          reject(new Error('Kokoro audio playback timed out'))
        })
      }, KokoroTTS.PLAYBACK_TIMEOUT_MS)

      const finalize = (callback: () => void) => {
        if (this.requestId !== requestId) {
          return
        }

        window.clearTimeout(timeoutId)
        this.speaking = false
        if (this.currentObjectUrl) {
          URL.revokeObjectURL(this.currentObjectUrl)
          this.currentObjectUrl = null
        }
        this.currentAudio = null
        callback()
      }

      audio.onended = () => {
        finalize(() => {
          recordVoiceDebugEvent('tts.kokoro.audio.play.ended', {})
          resolve()
        })
      }

      audio.onerror = () => {
        finalize(() => {
          recordVoiceDebugEvent('tts.kokoro.audio.play.error', {
            code: audio.error?.code,
            message: audio.error?.message,
          })
          reject(new Error('Kokoro audio playback error'))
        })
      }

      void audio.play()
        .then(() => {
          recordVoiceDebugEvent('tts.kokoro.audio.play.resolve', {})
        })
        .catch(error => {
          finalize(() => {
            recordVoiceDebugEvent('tts.kokoro.audio.play.reject', {
              message: error instanceof Error ? error.message : String(error),
            })
            reject(error instanceof Error ? error : new Error(String(error)))
          })
        })
    })
  }
}
