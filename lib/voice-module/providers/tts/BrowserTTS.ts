import type { TTSProvider } from './TTSProvider'

interface BrowserTTSConfig {
  language: string
  rate?: number
}

export class BrowserTTS implements TTSProvider {
  private config: Required<BrowserTTSConfig>
  private speaking = false

  constructor(config: BrowserTTSConfig) {
    this.config = {
      rate: 1,
      ...config,
    }
  }

  async speak(text: string): Promise<void> {
    const content = text.trim()
    if (!content) return

    if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') {
      throw new Error('Speech synthesis is not available')
    }

    this.stop()

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(content)
      utterance.lang = this.config.language
      utterance.rate = this.config.rate
      this.speaking = true

      utterance.onend = () => {
        this.speaking = false
        resolve()
      }

      utterance.onerror = () => {
        this.speaking = false
        reject(new Error('TTS error'))
      }

      speechSynthesis.speak(utterance)
    })
  }

  stop(): void {
    this.speaking = false
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel()
    }
  }

  isSpeaking(): boolean {
    return this.speaking
  }
}
