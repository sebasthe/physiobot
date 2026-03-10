import { VoiceEventEmitter } from './events'
import type { VoiceEventMap } from './events'
import { TurnManager } from './TurnManager'
import type { TurnContext, TurnState, VoiceConfig } from './types'
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

export class VoiceSession {
  private events = new VoiceEventEmitter()
  private turnManager: TurnManager
  private state: TurnState = 'idle'
  private history: Array<{ role: string; content: string }> = []

  constructor(
    private dependencies: VoiceSessionConfig,
  ) {
    this.turnManager = new TurnManager({
      events: this.events,
      tts: dependencies.tts,
      llm: dependencies.llm,
    })

    this.events.on('turnStateChanged', (state: TurnState) => {
      this.state = state
    })

    const previousPartialTranscript = dependencies.stt.onPartialTranscript
    const previousCommittedTranscript = dependencies.stt.onCommittedTranscript
    const previousErrorHandler = dependencies.stt.onError

    dependencies.stt.onPartialTranscript = text => {
      previousPartialTranscript?.(text)
      this.events.emit('partialTranscript', text)
    }

    dependencies.stt.onCommittedTranscript = text => {
      previousCommittedTranscript?.(text)
      this.events.emit('committedTranscript', text)
    }

    dependencies.stt.onError = error => {
      previousErrorHandler?.(error)
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
    this.events.emit('turnStateChanged', 'listening')
    this.events.emit('sessionStarted')
    try {
      await this.dependencies.stt.start()
    } catch (error) {
      this.events.emit('turnStateChanged', 'idle')
      throw error
    }
  }

  stopListening(): void {
    this.dependencies.stt.stop()
    if (this.state === 'listening') {
      this.events.emit('turnStateChanged', 'idle')
    }
    this.events.emit('sessionEnded')
  }

  async sendMessage(text: string, context: TurnContext): Promise<string> {
    if (this.dependencies.stt.isActive()) {
      this.dependencies.stt.stop()
    }

    const reply = await this.turnManager.handleUserMessage(text, context, this.history)
    this.history.push({ role: 'user', content: text })
    if (reply) {
      this.history.push({ role: 'assistant', content: reply })
    }
    return reply
  }

  interrupt(): void {
    this.dependencies.stt.stop()
    this.turnManager.interrupt()
  }

  getHistory(): Array<{ role: string; content: string }> {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }

  destroy(): void {
    this.dependencies.stt.stop()
    this.dependencies.tts.stop()
    this.events.removeAllListeners()
  }
}
