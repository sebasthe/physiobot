import { describeVoiceDebugText, recordVoiceDebugEvent } from '@/lib/voice-debug/client'
import type { TTSProvider } from './TTSProvider'

interface BrowserTTSConfig {
  language: string
  rate?: number
}

export class BrowserTTS implements TTSProvider {
  private config: Required<BrowserTTSConfig>
  private speaking = false
  private requestId = 0

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
      recordVoiceDebugEvent('tts.browser.unavailable', {})
      throw new Error('Speech synthesis is not available')
    }

    this.stop()
    recordVoiceDebugEvent('tts.browser.speak.request', {
      language: this.config.language,
      rate: this.config.rate,
      ...describeVoiceDebugText(content),
    })

    return new Promise<void>((resolve, reject) => {
      const requestId = this.requestId + 1
      this.requestId = requestId
      const utterance = new SpeechSynthesisUtterance(content)
      utterance.lang = this.config.language
      utterance.rate = this.config.rate
      this.speaking = true

      const finalize = (callback: () => void) => {
        if (this.requestId !== requestId) {
          return
        }

        this.speaking = false
        callback()
      }

      utterance.onend = () => {
        finalize(() => {
          recordVoiceDebugEvent('tts.browser.speak.ended', describeVoiceDebugText(content))
          resolve()
        })
      }

      utterance.onerror = event => {
        finalize(() => {
          recordVoiceDebugEvent('tts.browser.speak.error', {
            ...describeVoiceDebugText(content),
            error: event?.error ?? 'unknown',
          })
          reject(new Error(event?.error ? `TTS error: ${event.error}` : 'TTS error'))
        })
      }

      speechSynthesis.speak(utterance)
    })
  }

  stop(): void {
    const wasSpeaking = this.speaking
    this.requestId += 1
    this.speaking = false

    if (wasSpeaking && typeof speechSynthesis !== 'undefined') {
      recordVoiceDebugEvent('tts.browser.stop', {})
      speechSynthesis.cancel()
    }
  }

  isSpeaking(): boolean {
    return this.speaking
  }
}
