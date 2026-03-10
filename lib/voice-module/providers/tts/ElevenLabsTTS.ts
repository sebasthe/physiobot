import { BrowserTTS } from './BrowserTTS'
import type { TTSProvider } from './TTSProvider'

interface ElevenLabsTTSConfig {
  streamEndpoint: string
  fullEndpoint: string
  maxStreamLength: number
  fallbackLanguage?: string
}

export class ElevenLabsTTS implements TTSProvider {
  private currentAudio: HTMLAudioElement | null = null
  private currentObjectUrl: string | null = null
  private speaking = false
  private fallback: BrowserTTS

  constructor(private config: ElevenLabsTTSConfig) {
    this.fallback = new BrowserTTS({ language: config.fallbackLanguage ?? 'de-DE' })
  }

  async speak(text: string): Promise<void> {
    const content = text.trim()
    if (!content) return

    this.stop()

    try {
      const audioBlob = content.length <= this.config.maxStreamLength
        ? await this.fetchStreaming(content)
        : await this.fetchFull(content)

      await this.playBlob(audioBlob)
    } catch {
      this.speaking = false
      await this.fallback.speak(content)
    }
  }

  stop(): void {
    this.speaking = false

    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.src = ''
      this.currentAudio = null
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }

    this.fallback.stop()
  }

  isSpeaking(): boolean {
    return this.speaking || this.fallback.isSpeaking()
  }

  private async fetchStreaming(text: string): Promise<Blob> {
    const url = `${this.config.streamEndpoint}?text=${encodeURIComponent(text)}`
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) {
      throw new Error(`Stream TTS failed: ${response.status}`)
    }

    return response.blob()
  }

  private async fetchFull(text: string): Promise<Blob> {
    const response = await fetch(this.config.fullEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      throw new Error(`Full TTS failed: ${response.status}`)
    }

    return response.blob()
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob)
      const audio = new Audio(objectUrl)

      this.currentObjectUrl = objectUrl
      this.currentAudio = audio
      this.speaking = true

      const cleanup = () => {
        this.speaking = false
        if (this.currentObjectUrl) {
          URL.revokeObjectURL(this.currentObjectUrl)
          this.currentObjectUrl = null
        }
        this.currentAudio = null
      }

      audio.onended = () => {
        cleanup()
        resolve()
      }

      audio.onerror = () => {
        cleanup()
        reject(new Error('Audio playback error'))
      }

      void audio.play().catch(error => {
        cleanup()
        reject(error)
      })
    })
  }
}
