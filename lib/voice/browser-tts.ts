import type { VoiceProvider } from './types'

export class BrowserTTSProvider implements VoiceProvider {
  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') { resolve(); return }
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'de-DE'
      utterance.rate = 1.0
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
  }

  stop(): void {
    if (typeof window !== 'undefined') {
      window.speechSynthesis.cancel()
    }
  }
}
