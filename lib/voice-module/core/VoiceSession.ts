import { VoiceEventEmitter } from './events'
import type { VoiceEventMap } from './events'
import { Debouncer, SilenceEscalator } from './resilience'
import { shouldRequestRepeat } from './stt-utils'
import { TurnManager } from './TurnManager'
import type { TurnContext, TurnState, VoiceConfig } from './types'
import { describeVoiceDebugText, recordVoiceDebugEvent } from '@/lib/voice-debug/client'
import type { LLMProvider } from '../providers/llm/LLMProvider'
import type { STTProvider } from '../providers/stt/STTProvider'
import type { TTSProvider } from '../providers/tts/TTSProvider'

interface VoiceSessionConfig {
  config: VoiceConfig
  stt: STTProvider
  tts: TTSProvider
  llm: LLMProvider
}

type VoiceSessionEventHandler<K extends keyof VoiceEventMap> = VoiceEventMap[K] extends void
  ? () => void
  : (data: VoiceEventMap[K]) => void

const COMMITTED_TRANSCRIPT_DEBOUNCE_MS = 300
const SILENCE_NUDGE_AFTER_MS = 30_000
const SILENCE_CHECK_AFTER_MS = 60_000
const SILENCE_PAUSE_AFTER_MS = 90_000

export class VoiceSession {
  private events = new VoiceEventEmitter()
  private turnManager: TurnManager
  private state: TurnState = 'idle'
  private history: Array<{ role: string; content: string }> = []
  private committedTranscriptDebouncer = new Debouncer(COMMITTED_TRANSCRIPT_DEBOUNCE_MS)
  private silenceEscalator: SilenceEscalator
  private silenceEscalatorActive = false
  private destroyed = false
  private hasConversationActivity = false

  constructor(
    private dependencies: VoiceSessionConfig,
  ) {
    recordVoiceDebugEvent('voice-session.init', {
      config: dependencies.config,
    })

    this.turnManager = new TurnManager({
      events: this.events,
      tts: dependencies.tts,
      llm: dependencies.llm,
      enableClassification: true,
    })
    this.silenceEscalator = new SilenceEscalator({
      nudgeAfterMs: SILENCE_NUDGE_AFTER_MS,
      checkAfterMs: SILENCE_CHECK_AFTER_MS,
      pauseAfterMs: SILENCE_PAUSE_AFTER_MS,
      onNudge: () => {
        void this.handleSilencePrompt(this.getLocalizedPrompt('nudge'))
      },
      onCheck: () => {
        void this.handleSilencePrompt(this.getLocalizedPrompt('check'))
      },
      onPause: () => {
        this.stopSilenceEscalator()
        this.events.emit('toolCall', { name: 'pause_workout', input: {} })
      },
    })

    this.events.on('turnStateChanged', (state: TurnState) => {
      this.state = state
      recordVoiceDebugEvent('voice-session.turn-state', { state })
    })

    const previousPartialTranscript = dependencies.stt.onPartialTranscript
    const previousCommittedTranscript = dependencies.stt.onCommittedTranscript
    const previousErrorHandler = dependencies.stt.onError
    const previousListeningStateHandler = dependencies.stt.onListeningStateChange

    dependencies.stt.onListeningStateChange = active => {
      previousListeningStateHandler?.(active)
      recordVoiceDebugEvent('voice-session.stt.listening', { active })

      if (!active && this.state === 'listening') {
        this.events.emit('turnStateChanged', 'idle')
      }
    }

    dependencies.stt.onPartialTranscript = text => {
      previousPartialTranscript?.(text)
      recordVoiceDebugEvent('voice-session.stt.partial', describeVoiceDebugText(text))
      this.events.emit('partialTranscript', text)
    }

    dependencies.stt.onCommittedTranscript = text => {
      previousCommittedTranscript?.(text)
      recordVoiceDebugEvent('voice-session.stt.committed', describeVoiceDebugText(text))
      this.committedTranscriptDebouncer.call(() => {
        void this.handleCommittedTranscript(text)
      })
    }

    dependencies.stt.onError = error => {
      previousErrorHandler?.(error)
      recordVoiceDebugEvent('voice-session.stt.error', {
        message: error.message,
      })
      this.stopSilenceEscalator()
      this.events.emit('turnStateChanged', 'idle')
      this.events.emit('error', error)
    }
  }

  getState(): TurnState {
    return this.state
  }

  on<K extends keyof VoiceEventMap>(event: K, handler: VoiceSessionEventHandler<K>): void {
    this.events.on(event, handler)
  }

  off<K extends keyof VoiceEventMap>(event: K, handler: VoiceSessionEventHandler<K>): void {
    this.events.off(event, handler)
  }

  async startListening(): Promise<void> {
    recordVoiceDebugEvent('voice-session.start-listening.requested', {
      currentState: this.state,
    })
    this.events.emit('turnStateChanged', 'listening')
    this.events.emit('sessionStarted')
    try {
      await this.dependencies.stt.start()
      recordVoiceDebugEvent('voice-session.start-listening.started', {})
    } catch (error) {
      this.events.emit('turnStateChanged', 'idle')
      recordVoiceDebugEvent('voice-session.start-listening.failed', {
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  stopListening(): void {
    this.stopSilenceEscalator()
    this.dependencies.stt.stop()
    recordVoiceDebugEvent('voice-session.stop-listening', {
      currentState: this.state,
    })
    if (this.state === 'listening') {
      this.events.emit('turnStateChanged', 'idle')
    }
    this.events.emit('sessionEnded')
  }

  async sendMessage(text: string, context: TurnContext): Promise<string> {
    this.hasConversationActivity = true
    this.stopSilenceEscalator()

    recordVoiceDebugEvent('voice-session.send-message.requested', {
      ...describeVoiceDebugText(text),
      toolCount: context.tools?.length ?? 0,
    })
    if (this.dependencies.stt.isActive()) {
      this.dependencies.stt.stop()
    }

    const reply = await this.turnManager.handleUserMessage(text, context, this.history)
    this.history.push({ role: 'user', content: text })
    if (reply) {
      this.history.push({ role: 'assistant', content: reply })
    }
    recordVoiceDebugEvent('voice-session.send-message.completed', describeVoiceDebugText(reply))
    this.startSilenceEscalatorIfNeeded()
    return reply
  }

  interrupt(): void {
    this.stopSilenceEscalator()
    this.committedTranscriptDebouncer.cancel()
    this.dependencies.stt.stop()
    this.turnManager.interrupt()
    recordVoiceDebugEvent('voice-session.interrupt', {
      currentState: this.state,
    })
  }

  getHistory(): Array<{ role: string; content: string }> {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
    this.hasConversationActivity = false
    this.stopSilenceEscalator()
  }

  destroy(): void {
    this.destroyed = true
    this.stopSilenceEscalator()
    this.committedTranscriptDebouncer.cancel()
    this.dependencies.stt.stop()
    this.dependencies.tts.stop()
    recordVoiceDebugEvent('voice-session.destroy', {})
    this.events.removeAllListeners()
  }

  private async handleCommittedTranscript(text: string): Promise<void> {
    if (this.destroyed) {
      return
    }

    this.hasConversationActivity = true
    this.resetSilenceEscalator()

    if (shouldRequestRepeat(text)) {
      recordVoiceDebugEvent('voice-session.stt.repeat-requested', describeVoiceDebugText(text))
      try {
        this.events.emit('turnStateChanged', 'speaking')
        await this.dependencies.tts.speak(this.getLocalizedPrompt('repeat'))
      } catch (error) {
        this.events.emit('error', toError(error))
      } finally {
        if (!this.destroyed) {
          this.events.emit('turnStateChanged', 'idle')
          if (this.dependencies.config.autoListen && !this.dependencies.stt.isActive()) {
            void this.startListening().catch(repeatError => {
              this.events.emit('error', toError(repeatError))
            })
          } else {
            this.startSilenceEscalatorIfNeeded()
          }
        }
      }
      return
    }

    this.events.emit('committedTranscript', text)
  }

  private async handleSilencePrompt(prompt: string): Promise<void> {
    if (this.destroyed || this.dependencies.tts.isSpeaking()) {
      return
    }

    try {
      this.events.emit('turnStateChanged', 'speaking')
      await this.dependencies.tts.speak(prompt)
    } catch (error) {
      this.events.emit('error', toError(error))
    } finally {
      if (!this.destroyed) {
        this.events.emit('turnStateChanged', 'idle')
      }
    }
  }

  private startSilenceEscalatorIfNeeded(): void {
    if (
      this.destroyed
      || this.silenceEscalatorActive
      || !this.hasConversationActivity
      || this.dependencies.tts.isSpeaking()
    ) {
      return
    }

    this.silenceEscalator.start()
    this.silenceEscalatorActive = true
  }

  private resetSilenceEscalator(): void {
    if (this.destroyed || !this.hasConversationActivity) {
      return
    }

    this.silenceEscalator.reset()
    this.silenceEscalatorActive = true
  }

  private stopSilenceEscalator(): void {
    this.silenceEscalator.stop()
    this.silenceEscalatorActive = false
  }

  private getLocalizedPrompt(kind: 'repeat' | 'nudge' | 'check'): string {
    const isEnglish = this.dependencies.config.language.toLowerCase().startsWith('en')

    if (kind === 'repeat') {
      return isEnglish ? 'Could you say that again?' : 'Kannst du das nochmal sagen?'
    }

    if (kind === 'nudge') {
      return isEnglish ? 'You still with me?' : 'Alles gut bei dir?'
    }

    return isEnglish
      ? 'Everything okay? Let me know if you need help.'
      : 'Alles ok? Sag Bescheid wenn du Hilfe brauchst.'
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
