import { describeVoiceDebugText, recordVoiceDebugEvent } from '@/lib/voice-debug/client'
import { BrowserTTS } from './BrowserTTS'
import type { TTSProvider } from './TTSProvider'

interface ElevenLabsTTSConfig {
  streamEndpoint: string
  fullEndpoint: string
  maxStreamLength: number
  fallbackLanguage?: string
  onFallback?: (error: Error) => void
}

export class ElevenLabsTTS implements TTSProvider {
  private currentAudio: HTMLAudioElement | null = null
  private currentObjectUrl: string | null = null
  private speaking = false
  private fallback: BrowserTTS
  private fallbackActive = false

  constructor(private config: ElevenLabsTTSConfig) {
    this.fallback = new BrowserTTS({ language: config.fallbackLanguage ?? 'de-DE' })
  }

  async speak(text: string): Promise<void> {
    const content = text.trim()
    if (!content) return

    this.stop()
    recordVoiceDebugEvent('tts.elevenlabs.speak.request', describeVoiceDebugText(content))

    try {
      const audioBlob = content.length <= this.config.maxStreamLength
        ? await this.fetchStreaming(content)
        : await this.fetchFull(content)

      await this.playBlob(audioBlob)
      recordVoiceDebugEvent('tts.elevenlabs.speak.ended', describeVoiceDebugText(content))
    } catch (error) {
      const primaryError = toError(error)
      this.speaking = false
      recordVoiceDebugEvent('tts.elevenlabs.speak.error', {
        ...describeVoiceDebugText(content),
        message: primaryError.message,
      })
      this.config.onFallback?.(primaryError)
      console.warn('ElevenLabs TTS failed, falling back to browser speech synthesis', primaryError)

      try {
        this.fallbackActive = true
        recordVoiceDebugEvent('tts.elevenlabs.fallback.browser.start', describeVoiceDebugText(content))
        await this.fallback.speak(content)
        recordVoiceDebugEvent('tts.elevenlabs.fallback.browser.ended', describeVoiceDebugText(content))
      } catch (fallbackError) {
        recordVoiceDebugEvent('tts.elevenlabs.fallback.browser.error', {
          ...describeVoiceDebugText(content),
          message: toError(fallbackError).message,
        })
        throw combineTtsErrors(primaryError, fallbackError)
      } finally {
        this.fallbackActive = false
      }
    }
  }

  stop(): void {
    this.speaking = false
    recordVoiceDebugEvent('tts.elevenlabs.stop', {})

    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.src = ''
      this.currentAudio = null
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }

    if (this.fallbackActive || this.fallback.isSpeaking()) {
      this.fallback.stop()
    }

    this.fallbackActive = false
  }

  isSpeaking(): boolean {
    return this.speaking || this.fallback.isSpeaking()
  }

  private async fetchStreaming(text: string): Promise<Blob> {
    const url = `${this.config.streamEndpoint}?text=${encodeURIComponent(text)}`
    recordVoiceDebugEvent('tts.elevenlabs.stream.fetch.start', {
      endpoint: this.config.streamEndpoint,
      ...describeVoiceDebugText(text),
    })
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) {
      recordVoiceDebugEvent('tts.elevenlabs.stream.fetch.error', {
        endpoint: this.config.streamEndpoint,
        status: response.status,
      })
      throw await this.createResponseError(response, `Stream TTS failed: ${response.status}`)
    }

    recordVoiceDebugEvent('tts.elevenlabs.stream.fetch.success', {
      endpoint: this.config.streamEndpoint,
      status: response.status,
    })
    return response.blob()
  }

  private async fetchFull(text: string): Promise<Blob> {
    recordVoiceDebugEvent('tts.elevenlabs.full.fetch.start', {
      endpoint: this.config.fullEndpoint,
      ...describeVoiceDebugText(text),
    })
    const response = await fetch(this.config.fullEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      recordVoiceDebugEvent('tts.elevenlabs.full.fetch.error', {
        endpoint: this.config.fullEndpoint,
        status: response.status,
      })
      throw await this.createResponseError(response, `Full TTS failed: ${response.status}`)
    }

    recordVoiceDebugEvent('tts.elevenlabs.full.fetch.success', {
      endpoint: this.config.fullEndpoint,
      status: response.status,
    })
    return response.blob()
  }

  private async createResponseError(response: Response, fallbackMessage: string): Promise<Error> {
    let payload: unknown = null
    let rawText = ''
    const contentType = response.headers.get('content-type') ?? ''

    try {
      if (contentType.includes('application/json')) {
        payload = await response.json()
      } else {
        rawText = (await response.text()).trim()
      }
    } catch {
      rawText = rawText.trim()
    }

    if (!rawText && typeof payload === 'string') {
      rawText = payload.trim()
    }

    const payloadRecord = asRecord(payload)
    const message = readString(payloadRecord?.error)
      ?? readString(payloadRecord?.message)
      ?? rawText
      ?? fallbackMessage
    const code = readString(payloadRecord?.providerCode) ?? readString(payloadRecord?.code)

    return new Error(code ? `${message} (${code})` : message)
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob)
      const audio = new Audio(objectUrl)

      this.currentObjectUrl = objectUrl
      this.currentAudio = audio
      this.speaking = true
      recordVoiceDebugEvent('tts.elevenlabs.audio.play.start', {
        size: blob.size,
        type: blob.type,
      })

      const cleanup = () => {
        this.speaking = false
        if (this.currentObjectUrl) {
          URL.revokeObjectURL(this.currentObjectUrl)
          this.currentObjectUrl = null
        }
        this.currentAudio = null
      }

      audio.onended = () => {
        recordVoiceDebugEvent('tts.elevenlabs.audio.play.ended', {})
        cleanup()
        resolve()
      }

      audio.onerror = () => {
        recordVoiceDebugEvent('tts.elevenlabs.audio.play.error', {
          code: audio.error?.code,
          message: audio.error?.message,
        })
        cleanup()
        reject(new Error('Audio playback error'))
      }

      void audio.play().catch(error => {
        recordVoiceDebugEvent('tts.elevenlabs.audio.play.reject', {
          message: toError(error).message,
        })
        cleanup()
        reject(error)
      })
    })
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function combineTtsErrors(primaryError: Error, fallbackError: unknown): Error {
  const browserError = toError(fallbackError)
  return new Error(`${primaryError.message}. Browser fallback failed: ${browserError.message}`)
}
