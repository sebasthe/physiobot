import { describeVoiceDebugText, recordVoiceDebugEvent } from '@/lib/voice-debug/client'
import type { STTProvider } from './STTProvider'

interface BrowserSTTConfig {
  language: string
}

interface SpeechRecognitionResultLike {
  isFinal?: boolean
  0?: {
    transcript?: string
  }
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike {
  error?: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop?(): void
  abort?(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export class BrowserSTT implements STTProvider {
  onListeningStateChange: ((active: boolean) => void) | null = null
  onPartialTranscript: ((text: string) => void) | null = null
  onCommittedTranscript: ((text: string) => void) | null = null
  onError: ((error: Error) => void) | null = null

  private recognition: SpeechRecognitionLike | null = null
  private active = false
  private suppressNextError = false

  constructor(private config: BrowserSTTConfig) {}

  async start(): Promise<void> {
    if (this.active) return

    const Recognition = resolveSpeechRecognition()
    if (!Recognition) {
      recordVoiceDebugEvent('stt.browser.unavailable', {})
      throw new Error('SpeechRecognition not available')
    }

    const recognition = new Recognition()
    this.suppressNextError = false
    recognition.lang = this.config.language
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = event => {
      const result = event.results[event.results.length - 1]
      const transcript = result?.[0]?.transcript?.trim() ?? ''
      if (!transcript) return

      if (result?.isFinal) {
        recordVoiceDebugEvent('stt.browser.committed', describeVoiceDebugText(transcript))
        this.onCommittedTranscript?.(transcript)
        return
      }

      recordVoiceDebugEvent('stt.browser.partial', describeVoiceDebugText(transcript))
      this.onPartialTranscript?.(transcript)
    }

    recognition.onerror = event => {
      const errorCode = normalizeSpeechRecognitionError(event.error)
      this.active = false
      this.recognition = null
      this.onListeningStateChange?.(false)
      if (shouldSuppressSpeechRecognitionError(errorCode, this.suppressNextError)) {
        recordVoiceDebugEvent('stt.browser.error.suppressed', {
          error: errorCode ?? 'unknown',
          intentional: this.suppressNextError,
        })
        this.suppressNextError = false
        return
      }

      recordVoiceDebugEvent('stt.browser.error', {
        error: errorCode ?? 'unknown',
      })
      this.onError?.(new Error(`SpeechRecognition error: ${errorCode ?? 'unknown'}`))
    }

    recognition.onend = () => {
      this.active = false
      this.recognition = null
      recordVoiceDebugEvent('stt.browser.listening', { active: false })
      this.onListeningStateChange?.(false)
    }

    recognition.start()
    this.recognition = recognition
    this.active = true
    recordVoiceDebugEvent('stt.browser.listening', { active: true })
    this.onListeningStateChange?.(true)
  }

  stop(): void {
    const recognition = this.recognition
    const wasActive = this.active || Boolean(recognition)
    this.active = false
    this.recognition = null
    this.suppressNextError = true

    try {
      recognition?.abort?.()
    } catch {
      recognition?.stop?.()
    }

    if (wasActive) {
      recordVoiceDebugEvent('stt.browser.stop', {})
      this.onListeningStateChange?.(false)
    }
  }

  isActive(): boolean {
    return this.active
  }
}

function normalizeSpeechRecognitionError(error: string | undefined): string | null {
  const normalized = error?.trim()
  return normalized ? normalized : null
}

function shouldSuppressSpeechRecognitionError(
  errorCode: string | null,
  intentionalStop: boolean,
): boolean {
  if (intentionalStop) {
    return true
  }

  return errorCode === null || errorCode === 'aborted' || errorCode === 'no-speech'
}

function resolveSpeechRecognition(): SpeechRecognitionCtor | null {
  const scope = globalThis as Record<string, unknown>
  const constructor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition

  if (typeof constructor !== 'function') {
    return null
  }

  return constructor as SpeechRecognitionCtor
}
