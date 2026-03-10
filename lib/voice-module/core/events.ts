import type { TranscriptMessage, TurnState } from './types'

export interface VoiceEventMap {
  turnStateChanged: TurnState
  toolCall: { name: string; input: Record<string, unknown> }
  transcript: TranscriptMessage
  partialTranscript: string
  committedTranscript: string
  error: Error
  interruptRequested: void
  sessionStarted: void
  sessionEnded: void
}

type EventHandler<T> = T extends void ? () => void : (data: T) => void
type InternalHandler = (...args: unknown[]) => void

export class VoiceEventEmitter {
  private listeners = new Map<keyof VoiceEventMap, Set<InternalHandler>>()

  on<K extends keyof VoiceEventMap>(event: K, handler: EventHandler<VoiceEventMap[K]>): void {
    const handlers = this.listeners.get(event) ?? new Set<InternalHandler>()
    handlers.add(handler as InternalHandler)
    this.listeners.set(event, handlers)
  }

  off<K extends keyof VoiceEventMap>(event: K, handler: EventHandler<VoiceEventMap[K]>): void {
    this.listeners.get(event)?.delete(handler as InternalHandler)
  }

  emit<K extends keyof VoiceEventMap>(
    event: K,
    ...args: VoiceEventMap[K] extends void ? [] : [VoiceEventMap[K]]
  ): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return

    for (const handler of handlers) {
      handler(...args)
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}
