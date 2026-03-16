import { describeVoiceDebugText, recordVoiceDebugEvent } from '@/lib/voice-debug/client'
import type { STTProvider } from './STTProvider'

interface ElevenLabsSTTConfig {
  language: string
  tokenEndpoint: string
  sampleRate?: number
  targetSampleRate?: number
}

interface TranscriptPayload {
  type?: string
  message_type?: string
  text?: string
}

type ScriptProcessorEvent = {
  inputBuffer: {
    getChannelData(channel: number): Float32Array
  }
}

export class ElevenLabsSTT implements STTProvider {
  onListeningStateChange: ((active: boolean) => void) | null = null
  onPartialTranscript: ((text: string) => void) | null = null
  onCommittedTranscript: ((text: string) => void) | null = null
  onError: ((error: Error) => void) | null = null

  private config: Required<ElevenLabsSTTConfig>
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private sinkGainNode: GainNode | null = null
  private active = false

  constructor(config: ElevenLabsSTTConfig) {
    this.config = {
      sampleRate: 48000,
      targetSampleRate: 16000,
      ...config,
    }
  }

  isActive(): boolean {
    return this.active
  }

  async start(): Promise<void> {
    this.stop()
    recordVoiceDebugEvent('stt.elevenlabs.start.requested', {
      language: this.config.language,
      tokenEndpoint: this.config.tokenEndpoint,
    })

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      recordVoiceDebugEvent('stt.elevenlabs.unavailable', {})
      throw new Error('Speech input is only available in the browser')
    }

    const token = await this.fetchToken()

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.config.sampleRate,
          sampleSize: 16,
        } as MediaTrackConstraints,
      })
    } catch {
      recordVoiceDebugEvent('stt.elevenlabs.microphone.denied', {})
      throw new Error('Mikrofonzugriff wurde verweigert oder ist nicht verfuegbar')
    }

    const [track] = this.mediaStream.getAudioTracks()
    try {
      await track?.applyConstraints?.({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      } as MediaTrackConstraints)
    } catch {
      // Browsers vary here; runtime constraints are optional.
    }

    this.audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: this.config.sampleRate })
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => undefined)
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1)
    this.sinkGainNode = this.audioContext.createGain()
    this.sinkGainNode.gain.value = 0

    this.sourceNode.connect(this.processorNode)
    this.processorNode.connect(this.sinkGainNode)
    this.sinkGainNode.connect(this.audioContext.destination)

    this.ws = this.createWebSocket(token)
    await this.awaitOpen(this.ws)

    this.ws.onmessage = event => {
      const payload = parseTranscriptPayload(event.data)
      if (!payload) return

      const messageType = payload.type ?? payload.message_type
      if (!messageType) return

      if (messageType === 'partial_transcript') {
        recordVoiceDebugEvent('stt.elevenlabs.partial', describeVoiceDebugText(payload.text ?? ''))
        this.onPartialTranscript?.(payload.text ?? '')
        return
      }

      if (messageType === 'committed_transcript') {
        const transcript = (payload.text ?? '').trim()
        if (transcript) {
          recordVoiceDebugEvent('stt.elevenlabs.committed', describeVoiceDebugText(transcript))
          this.onCommittedTranscript?.(transcript)
        }
        return
      }

      if (messageType.includes('error')) {
        recordVoiceDebugEvent('stt.elevenlabs.stream.error', {
          messageType,
        })
        this.onError?.(new Error('Realtime-Transkription meldet einen Fehler.'))
      }
    }

    this.ws.onerror = () => {
      recordVoiceDebugEvent('stt.elevenlabs.websocket.error', {})
      this.onError?.(new Error('Realtime-Verbindung konnte nicht geoeffnet werden'))
    }

    this.ws.onclose = () => {
      this.active = false
      recordVoiceDebugEvent('stt.elevenlabs.listening', { active: false })
      this.onListeningStateChange?.(false)
    }

    this.processorNode.onaudioprocess = event => {
      if (!this.ws || this.ws.readyState !== 1 || this.ws.bufferedAmount > 128000) {
        return
      }

      const channelData = event.inputBuffer.getChannelData(0)
      const pcm16 = downsampleToPcm16(
        channelData,
        this.audioContext?.sampleRate ?? this.config.sampleRate,
        this.config.targetSampleRate,
      )

      if (pcm16.length === 0) return

      this.ws.send(JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: int16ToBase64(pcm16),
        sample_rate: this.config.targetSampleRate,
      }))
    }

    this.active = true
    recordVoiceDebugEvent('stt.elevenlabs.listening', { active: true })
    this.onListeningStateChange?.(true)
  }

  stop(): void {
    const wasActive = this.active
    this.active = false
    recordVoiceDebugEvent('stt.elevenlabs.stop', {})

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null
      this.processorNode.disconnect()
      this.processorNode = null
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }

    if (this.sinkGainNode) {
      this.sinkGainNode.disconnect()
      this.sinkGainNode = null
    }

    if (this.audioContext) {
      void this.audioContext.close()
      this.audioContext = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    if (wasActive) {
      recordVoiceDebugEvent('stt.elevenlabs.listening', { active: false })
      this.onListeningStateChange?.(false)
    }
  }

  private async fetchToken(): Promise<string> {
    recordVoiceDebugEvent('stt.elevenlabs.token.fetch.start', {
      endpoint: this.config.tokenEndpoint,
    })
    const response = await fetch(this.config.tokenEndpoint, { method: 'POST' })
    if (!response.ok) {
      recordVoiceDebugEvent('stt.elevenlabs.token.fetch.error', {
        endpoint: this.config.tokenEndpoint,
        status: response.status,
      })
      throw new Error('Realtime token konnte nicht geladen werden')
    }

    const payload = await response.json() as { sttToken?: string }
    if (!payload.sttToken) {
      recordVoiceDebugEvent('stt.elevenlabs.token.fetch.error', {
        endpoint: this.config.tokenEndpoint,
        message: 'Realtime token fehlt',
      })
      throw new Error('Realtime token fehlt')
    }

    recordVoiceDebugEvent('stt.elevenlabs.token.fetch.success', {
      endpoint: this.config.tokenEndpoint,
    })
    return payload.sttToken
  }

  private createWebSocket(token: string): WebSocket {
    const url = new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime')
    url.searchParams.set('model_id', 'scribe_v2_realtime')
    url.searchParams.set('token', token)
    url.searchParams.set('language_code', this.config.language)
    url.searchParams.set('audio_format', 'pcm_16000')
    url.searchParams.set('commit_strategy', 'vad')
    url.searchParams.set('vad_silence_threshold_secs', '0.8')
    url.searchParams.set('min_speech_duration_ms', '100')
    url.searchParams.set('min_silence_duration_ms', '150')

    recordVoiceDebugEvent('stt.elevenlabs.websocket.create', {
      endpoint: url.toString().replace(token, 'redacted'),
    })
    return new WebSocket(url.toString())
  }

  private awaitOpen(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        recordVoiceDebugEvent('stt.elevenlabs.websocket.timeout', {})
        reject(new Error('Verbindung zum Realtime-Transkriptionsdienst dauert zu lange'))
      }, 8000)

      ws.onopen = () => {
        window.clearTimeout(timeout)
        recordVoiceDebugEvent('stt.elevenlabs.websocket.open', {})
        resolve()
      }

      ws.onerror = () => {
        window.clearTimeout(timeout)
        recordVoiceDebugEvent('stt.elevenlabs.websocket.open-error', {})
        reject(new Error('Realtime-Verbindung konnte nicht geoeffnet werden'))
      }
    })
  }
}

function parseTranscriptPayload(rawData: string | ArrayBuffer | Blob): TranscriptPayload | null {
  if (typeof rawData !== 'string') return null

  try {
    return JSON.parse(rawData) as TranscriptPayload
  } catch {
    return null
  }
}

function downsampleToPcm16(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Int16Array {
  if (outputSampleRate >= inputSampleRate) {
    const output = new Int16Array(input.length)

    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i] ?? 0))
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }

    return output
  }

  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.round(input.length / ratio)
  const output = new Int16Array(outputLength)

  let outputOffset = 0
  let inputOffset = 0

  while (outputOffset < outputLength) {
    const nextOffset = Math.round((outputOffset + 1) * ratio)
    let accumulated = 0
    let count = 0

    for (let i = inputOffset; i < nextOffset && i < input.length; i += 1) {
      accumulated += input[i] ?? 0
      count += 1
    }

    const sample = count > 0 ? accumulated / count : 0
    const clipped = Math.max(-1, Math.min(1, sample))
    output[outputOffset] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff
    outputOffset += 1
    inputOffset = nextOffset
  }

  return output
}

function int16ToBase64(buffer: Int16Array): string {
  const bytes = new Uint8Array(buffer.buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }

  if (typeof btoa === 'function') {
    return btoa(binary)
  }

  return Buffer.from(binary, 'binary').toString('base64')
}

export const __private__ = {
  downsampleToPcm16,
  int16ToBase64,
}
