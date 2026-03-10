import type { VoiceEventEmitter } from './events'
import type { StreamChunk, TurnContext } from './types'
import type { LLMProvider } from '../providers/llm/LLMProvider'
import type { TTSProvider } from '../providers/tts/TTSProvider'

interface TurnManagerConfig {
  events: VoiceEventEmitter
  tts: TTSProvider
  llm: LLMProvider
}

export class TurnManager {
  private interrupted = false

  constructor(
    private config: TurnManagerConfig,
  ) {}

  async handleUserMessage(
    text: string,
    context: TurnContext,
    history: Array<{ role: string; content: string }>,
  ): Promise<string> {
    this.interrupted = false
    this.config.events.emit('turnStateChanged', 'processing')
    this.config.events.emit('transcript', {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    })

    const messages = [...history, { role: 'user', content: text }]
    const stream = this.config.llm.streamTurn(context, messages)

    let fullReply = ''
    let buffer = ''
    let doneReply = ''
    const speechQueue: string[] = []
    let speechTask: Promise<void> | null = null

    const processSpeechQueue = async () => {
      while (speechQueue.length > 0 && !this.interrupted) {
        const nextChunk = speechQueue.shift()
        if (!nextChunk) continue
        this.config.events.emit('turnStateChanged', 'speaking')
        await this.config.tts.speak(nextChunk)
      }
    }

    const ensureSpeechQueue = () => {
      if (speechTask || speechQueue.length === 0) return
      speechTask = processSpeechQueue().finally(() => {
        speechTask = null
      })
    }

    const queueCompleteSentences = () => {
      const sentences = buffer.split(/(?<=[.!?…])\s+/)
      if (sentences.length <= 1) return

      for (let index = 0; index < sentences.length - 1; index += 1) {
        const sentence = sentences[index]?.trim()
        if (sentence) {
          speechQueue.push(sentence)
        }
      }

      buffer = sentences[sentences.length - 1] ?? ''
    }

    try {
      for await (const chunk of stream) {
        if (this.interrupted) break

        if (chunk.type === 'delta') {
          fullReply += chunk.text
          buffer += chunk.text
          queueCompleteSentences()
          ensureSpeechQueue()
          continue
        }

        if (chunk.type === 'tool_call') {
          this.config.events.emit('toolCall', { name: chunk.name, input: chunk.input })
          continue
        }

        doneReply = chunk.reply
      }

      if (buffer.trim() && !this.interrupted) {
        speechQueue.push(buffer.trim())
        buffer = ''
        ensureSpeechQueue()
      }

      if (speechTask) {
        await speechTask
      }

      if (speechQueue.length > 0 && !this.interrupted) {
        await processSpeechQueue()
      }

      const reply = (fullReply || doneReply).trim()
      if (!this.interrupted && reply) {
        this.config.events.emit('transcript', {
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
        })
      }

      return reply
    } catch (error) {
      this.config.events.emit('error', toError(error))
      throw toError(error)
    } finally {
      this.config.events.emit('turnStateChanged', 'idle')
    }
  }

  interrupt(): void {
    this.interrupted = true
    this.config.tts.stop()
    this.config.events.emit('interruptRequested')
    this.config.events.emit('turnStateChanged', 'idle')
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
