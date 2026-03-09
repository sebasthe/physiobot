import type { VoiceProvider } from './types'

export class ElevenLabsProvider implements VoiceProvider {
  private currentAudio: HTMLAudioElement | null = null
  private currentObjectUrl: string | null = null

  async speak(text: string): Promise<void> {
    this.stop()

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
      const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
      const objectUrl = URL.createObjectURL(blob)
      const audio = new Audio(objectUrl)
      this.currentAudio = audio
      this.currentObjectUrl = objectUrl
      audio.preload = 'auto'

      return new Promise((resolve) => {
        let resolved = false
        const done = () => {
          if (resolved) return
          resolved = true
          if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl)
            this.currentObjectUrl = null
          }
          this.currentAudio = null
          resolve()
        }

        audio.onended = done
        audio.onerror = done

        void audio.play().catch(async (err) => {
          console.warn('ElevenLabs HTMLAudio play failed, falling back to browser TTS:', err)
          done()
          const { BrowserTTSProvider } = await import('./browser-tts')
          await new BrowserTTSProvider().speak(text)
        })
      })
    } catch (err) {
      console.warn('ElevenLabs audio decode/play error, falling back to browser TTS:', err)
      const { BrowserTTSProvider } = await import('./browser-tts')
      return new BrowserTTSProvider().speak(text)
    }
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.currentTime = 0
      this.currentAudio = null
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }
  }
}
