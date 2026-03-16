import { describeVoiceDebugText, recordVoiceDebugEvent } from '@/lib/voice-debug/client'
import type { TTSProvider } from './TTSProvider'

interface BrowserTTSConfig {
  language: string
  rate?: number
}

export class BrowserTTS implements TTSProvider {
  private static readonly PREPARE_TIMEOUT_MS = 250

  private config: Required<BrowserTTSConfig>
  private speaking = false
  private requestId = 0
  private prepared = false
  private preparing: Promise<void> | null = null

  constructor(config: BrowserTTSConfig) {
    this.config = {
      rate: 1,
      ...config,
    }
  }

  async prepare(): Promise<void> {
    if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') {
      recordVoiceDebugEvent('tts.browser.unavailable', {})
      throw new Error('Speech synthesis is not available')
    }

    if (this.prepared) {
      return
    }

    if (this.preparing) {
      return this.preparing
    }

    const synthesis = speechSynthesis
    this.primeVoices()

    if (synthesis.paused) {
      synthesis.resume()
    }

    if (synthesis.speaking || synthesis.pending) {
      this.prepared = true
      recordVoiceDebugEvent('tts.browser.prepare.reused-active-engine', {
        language: this.config.language,
      })
      return
    }

    recordVoiceDebugEvent('tts.browser.prepare.start', {
      language: this.config.language,
    })

    this.preparing = new Promise<void>((resolve, reject) => {
      let settled = false
      const utterance = new SpeechSynthesisUtterance('.')
      utterance.lang = this.config.language
      utterance.rate = 1
      utterance.volume = 0
      utterance.voice = this.selectVoice()

      const timerId = window.setTimeout(() => {
        finish(() => {
          recordVoiceDebugEvent('tts.browser.prepare.timeout', {
            language: this.config.language,
          })
          resolve()
        })
      }, BrowserTTS.PREPARE_TIMEOUT_MS)

      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        window.clearTimeout(timerId)
        this.preparing = null
        callback()
      }

      utterance.onend = () => {
        finish(() => {
          this.prepared = true
          recordVoiceDebugEvent('tts.browser.prepare.success', {
            language: this.config.language,
          })
          resolve()
        })
      }

      utterance.onerror = event => {
        finish(() => {
          recordVoiceDebugEvent('tts.browser.prepare.error', {
            language: this.config.language,
            error: event?.error ?? 'unknown',
          })
          reject(new Error(event?.error ? `TTS prepare error: ${event.error}` : 'TTS prepare error'))
        })
      }

      try {
        synthesis.speak(utterance)
      } catch (error) {
        finish(() => {
          reject(error instanceof Error ? error : new Error('TTS prepare failed'))
        })
      }
    })

    return this.preparing
  }

  async speak(text: string): Promise<void> {
    const content = text.trim()
    if (!content) return

    if (typeof window === 'undefined' || typeof speechSynthesis === 'undefined') {
      recordVoiceDebugEvent('tts.browser.unavailable', {})
      throw new Error('Speech synthesis is not available')
    }

    this.stop()
    this.primeVoices()
    if (speechSynthesis.paused) {
      speechSynthesis.resume()
    }
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
      utterance.voice = this.selectVoice()
      this.speaking = true
      this.prepared = true

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

  private primeVoices(): void {
    if (typeof speechSynthesis.getVoices !== 'function') {
      return
    }

    try {
      speechSynthesis.getVoices()
    } catch {
      // Some browsers expose the API but can still throw before voices are ready.
    }
  }

  private selectVoice(): SpeechSynthesisVoice | null {
    if (typeof speechSynthesis.getVoices !== 'function') {
      return null
    }

    try {
      const voices = speechSynthesis.getVoices()
      if (voices.length === 0) {
        return null
      }

      const normalizedLanguage = this.config.language.toLowerCase()
      const languagePrefix = normalizedLanguage.split('-')[0]

      return voices.find(voice => voice.lang.toLowerCase() === normalizedLanguage)
        ?? voices.find(voice => voice.lang.toLowerCase().startsWith(`${languagePrefix}-`))
        ?? voices.find(voice => voice.lang.toLowerCase() === languagePrefix)
        ?? null
    } catch {
      return null
    }
  }
}
