type RealtimeTranscriptMessage = {
  message_type?: string
  text?: string
}

interface RealtimeOrchestratorOptions {
  token: string
  languageCode?: string
  onPartialTranscript: (text: string) => void
  onCommittedTranscript: (text: string) => void
  onError: (message: string) => void
}

export class ElevenLabsRealtimeOrchestrator {
  private ws: WebSocket | null = null
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private sinkGainNode: GainNode | null = null
  private active = false

  get isActive() {
    return this.active
  }

  async start(options: RealtimeOrchestratorOptions): Promise<void> {
    this.stop()

    if (typeof window === 'undefined') {
      throw new Error('Realtime orchestration only available in browser')
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          sampleSize: 16,
        } as MediaTrackConstraints,
      })
    } catch {
      throw new Error('Mikrofonzugriff wurde verweigert oder ist nicht verfügbar')
    }

    const [track] = this.stream.getAudioTracks()
    try {
      await track?.applyConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      } as MediaTrackConstraints)
    } catch {
      // Fallback silently on browsers that don't support runtime constraints
    }

    this.audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => undefined)
    }
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
    this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1)
    this.sinkGainNode = this.audioContext.createGain()
    this.sinkGainNode.gain.value = 0

    this.sourceNode.connect(this.processorNode)
    this.processorNode.connect(this.sinkGainNode)
    this.sinkGainNode.connect(this.audioContext.destination)

    const url = new URL('wss://api.elevenlabs.io/v1/speech-to-text/realtime')
    url.searchParams.set('model_id', 'scribe_v2_realtime')
    url.searchParams.set('token', options.token)
    url.searchParams.set('language_code', options.languageCode ?? 'de')
    url.searchParams.set('audio_format', 'pcm_16000')
    url.searchParams.set('commit_strategy', 'vad')
    url.searchParams.set('vad_silence_threshold_secs', '0.8')
    url.searchParams.set('min_speech_duration_ms', '100')
    url.searchParams.set('min_silence_duration_ms', '150')

    this.ws = new WebSocket(url.toString())
    this.active = true

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket konnte nicht erstellt werden'))
        return
      }
      const timeout = window.setTimeout(() => {
        reject(new Error('Verbindung zum Realtime-Transkriptionsdienst dauert zu lange'))
      }, 8000)

      this.ws.onopen = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      this.ws.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('Realtime-Verbindung konnte nicht geöffnet werden'))
      }
    })

    this.ws.onmessage = event => {
      let payload: RealtimeTranscriptMessage | null = null
      try {
        payload = JSON.parse(event.data as string) as RealtimeTranscriptMessage
      } catch {
        return
      }
      if (!payload?.message_type) return

      if (payload.message_type === 'partial_transcript') {
        options.onPartialTranscript(payload.text ?? '')
        return
      }
      if (payload.message_type === 'committed_transcript') {
        options.onCommittedTranscript((payload.text ?? '').trim())
        return
      }
      if (payload.message_type.includes('error')) {
        options.onError('Realtime-Transkription meldet einen Fehler. Bitte erneut versuchen.')
      }
    }

    this.ws.onclose = () => {
      this.active = false
    }

    this.processorNode.onaudioprocess = event => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (this.ws.bufferedAmount > 128000) return
      const channelData = event.inputBuffer.getChannelData(0)
      const pcm16 = downsampleToPcm16(channelData, this.audioContext?.sampleRate ?? 44100, 16000)
      if (pcm16.length === 0) return
      const base64 = int16ToBase64(pcm16)
      this.ws.send(JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: base64,
        sample_rate: 16000,
      }))
    }
  }

  stop() {
    this.active = false

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

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
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
  return btoa(binary)
}
