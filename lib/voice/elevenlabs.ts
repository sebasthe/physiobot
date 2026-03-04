import type { VoiceProvider } from './types'

export class ElevenLabsProvider implements VoiceProvider {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null

  async speak(text: string): Promise<void> {
    // Close any previous context before creating a new one
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
      this.currentSource = null
    }

    const response = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      const { BrowserTTSProvider } = await import('./browser-tts')
      return new BrowserTTSProvider().speak(text)
    }

    try {
      const audioBuffer = await response.arrayBuffer()
      this.audioContext = new AudioContext()
      const decoded = await this.audioContext.decodeAudioData(audioBuffer)
      this.currentSource = this.audioContext.createBufferSource()
      this.currentSource.buffer = decoded
      this.currentSource.connect(this.audioContext.destination)

      return new Promise((resolve) => {
        this.currentSource!.onended = () => {
          this.currentSource = null
          resolve()
        }
        this.currentSource!.start()
      })
    } catch (err) {
      console.warn('ElevenLabs audio decode/play error, falling back to browser TTS:', err)
      const { BrowserTTSProvider } = await import('./browser-tts')
      return new BrowserTTSProvider().speak(text)
    }
  }

  stop(): void {
    this.currentSource?.stop()
    this.currentSource = null
    this.audioContext?.close()
    this.audioContext = null
  }
}
