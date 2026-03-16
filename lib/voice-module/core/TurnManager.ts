import type { VoiceEventEmitter } from './events'
import type { StreamChunk, TurnContext } from './types'
import { classifyUtterance } from '@/lib/coach/utterance-classifier'
import { createTurnMetricsPayload } from '@/lib/telemetry/voice-metrics'
import type { TurnTimestamps } from '@/lib/telemetry/voice-metrics'
import type { LLMProvider } from '../providers/llm/LLMProvider'
import type { TTSProvider } from '../providers/tts/TTSProvider'

interface TurnManagerConfig {
  events: VoiceEventEmitter
  tts: TTSProvider
  llm: LLMProvider
  enableClassification?: boolean
  timeoutMs?: number
  maxQueueDepth?: number
}

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_MAX_QUEUE_DEPTH = 10
const TIMEOUT_FALLBACK_MESSAGE = 'Moment bitte, ich bin gleich wieder da.'

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

    const timestamps: TurnTimestamps = {
      sttCommitTime: Date.now(),
      classificationDoneTime: null,
      llmFirstTokenTime: null,
      llmDoneTime: null,
      ttsStartTime: null,
      ttsDoneTime: null,
    }
    let classificationCategory: 'command' | 'question' | 'feedback' | 'filler' | 'acknowledgment' | null = null
    let classificationFastPath = false
    let commandName: string | null = null
    let skippedReason: 'command' | 'filler' | 'acknowledgment' | null = null
    let llmTimedOut = false

    if (this.config.enableClassification) {
      const classification = await classifyUtterance(text)
      timestamps.classificationDoneTime = Date.now()
      classificationCategory = classification.category
      classificationFastPath = classification.fastPath
      commandName = classification.commandName ?? null

      if (classification.category === 'filler') {
        skippedReason = 'filler'
        this.emitMetrics({
          timestamps,
          utteranceCategory: classificationCategory,
          classificationFastPath,
          commandName,
          skippedReason,
          llmTimedOut,
        })
        return ''
      }

      if (classification.category === 'acknowledgment') {
        skippedReason = 'acknowledgment'
        this.emitMetrics({
          timestamps,
          utteranceCategory: classificationCategory,
          classificationFastPath,
          commandName,
          skippedReason,
          llmTimedOut,
        })
        return ''
      }

      if (classification.category === 'command' && classification.commandName) {
        skippedReason = 'command'
        this.emitUserTranscript(text)
        this.config.events.emit('toolCall', {
          name: classification.commandName,
          input: {},
        })
        this.emitMetrics({
          timestamps,
          utteranceCategory: classificationCategory,
          classificationFastPath,
          commandName,
          skippedReason,
          llmTimedOut,
        })
        return ''
      }
    }

    this.config.events.emit('turnStateChanged', 'processing')
    this.emitUserTranscript(text)

    const messages = [...history, { role: 'user', content: text }]
    const iterator = this.config.llm.streamTurn(context, messages)[Symbol.asyncIterator]()
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxQueueDepth = this.config.maxQueueDepth ?? DEFAULT_MAX_QUEUE_DEPTH

    let fullReply = ''
    let buffer = ''
    let doneReply = ''
    const speechQueue: string[] = []
    let speechTask: Promise<void> | null = null

    const enqueueSpeech = (chunk: string) => {
      const normalized = chunk.trim()
      if (!normalized) return

      speechQueue.push(normalized)
      if (speechQueue.length > maxQueueDepth) {
        speechQueue.splice(0, speechQueue.length - maxQueueDepth)
      }
    }

    const processSpeechQueue = async () => {
      while (speechQueue.length > 0 && !this.interrupted) {
        const nextChunk = speechQueue.shift()
        if (!nextChunk) continue
        this.config.events.emit('turnStateChanged', 'speaking')
        if (timestamps.ttsStartTime === null) {
          timestamps.ttsStartTime = Date.now()
        }
        await this.config.tts.speak(nextChunk)
        timestamps.ttsDoneTime = Date.now()
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
          enqueueSpeech(sentence)
        }
      }

      buffer = sentences[sentences.length - 1] ?? ''
    }

    try {
      while (!this.interrupted) {
        const nextResult = await nextChunkWithTimeout(iterator, timeoutMs)
        if (nextResult.done) {
          break
        }

        const chunk = nextResult.value
        if (chunk.type === 'delta') {
          if (timestamps.llmFirstTokenTime === null) {
            timestamps.llmFirstTokenTime = Date.now()
          }
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

        timestamps.llmDoneTime = Date.now()
        doneReply = chunk.reply
      }

      if (buffer.trim() && !this.interrupted) {
        enqueueSpeech(buffer)
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
      if (reply && timestamps.llmDoneTime === null) {
        timestamps.llmDoneTime = Date.now()
      }
      if (!this.interrupted && reply) {
        this.config.events.emit('transcript', {
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
        })
      }

      this.emitMetrics({
        timestamps,
        utteranceCategory: classificationCategory,
        classificationFastPath,
        commandName,
        skippedReason,
        llmTimedOut,
      })

      return reply
    } catch (error) {
      const resolvedError = toError(error)

      if (isTimeoutError(resolvedError) && !this.interrupted) {
        llmTimedOut = true
        try {
          this.config.events.emit('turnStateChanged', 'speaking')
          if (timestamps.ttsStartTime === null) {
            timestamps.ttsStartTime = Date.now()
          }
          await this.config.tts.speak(TIMEOUT_FALLBACK_MESSAGE)
          timestamps.ttsDoneTime = Date.now()
        } catch (speakError) {
          this.config.events.emit('error', toError(speakError))
        }

        this.config.events.emit('error', resolvedError)
        this.emitMetrics({
          timestamps,
          utteranceCategory: classificationCategory,
          classificationFastPath,
          commandName,
          skippedReason,
          llmTimedOut,
        })
        return ''
      }

      this.config.events.emit('error', resolvedError)
      throw resolvedError
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

  private emitUserTranscript(text: string): void {
    this.config.events.emit('transcript', {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    })
  }

  private emitMetrics(params: {
    timestamps: TurnTimestamps
    utteranceCategory?: 'command' | 'question' | 'feedback' | 'filler' | 'acknowledgment' | null
    classificationFastPath?: boolean
    commandName?: string | null
    skippedReason?: 'command' | 'filler' | 'acknowledgment' | null
    llmTimedOut?: boolean
  }): void {
    this.config.events.emit('metrics', createTurnMetricsPayload(params))
  }
}

async function nextChunkWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
): Promise<IteratorResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      iterator.next(),
      new Promise<IteratorResult<T>>((_, reject) => {
        timeoutId = setTimeout(() => {
          void iterator.return?.()
          reject(new TimeoutTurnError(`LLM turn timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

class TimeoutTurnError extends Error {}

function isTimeoutError(error: Error): error is TimeoutTurnError {
  return error instanceof TimeoutTurnError
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
