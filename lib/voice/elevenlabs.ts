import type { VoiceProvider } from './types'

export class ElevenLabsProvider implements VoiceProvider {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null

  async speak(text: string): Promise<void> {
    const response = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      // Fallback to browser TTS on error
      const { BrowserTTSProvider } = await import('./browser-tts')
      return new BrowserTTSProvider().speak(text)
    }

    const audioBuffer = await response.arrayBuffer()
    this.audioContext = new AudioContext()
    const decoded = await this.audioContext.decodeAudioData(audioBuffer)
    this.currentSource = this.audioContext.createBufferSource()
    this.currentSource.buffer = decoded
    this.currentSource.connect(this.audioContext.destination)

    return new Promise((resolve) => {
      this.currentSource!.onended = () => resolve()
      this.currentSource!.start()
    })
  }

  stop(): void {
    this.currentSource?.stop()
    this.audioContext?.close()
  }
}
