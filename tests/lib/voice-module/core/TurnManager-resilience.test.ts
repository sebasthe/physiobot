import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TurnManager } from '@/lib/voice-module/core/TurnManager'
import { VoiceEventEmitter } from '@/lib/voice-module/core/events'
import type { StreamChunk, TurnContext } from '@/lib/voice-module/core/types'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'

describe('TurnManager resilience', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out if the LLM takes too long and speaks a fallback', async () => {
    const events = new VoiceEventEmitter()
    const tts: TTSProvider = {
      speak: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      isSpeaking: vi.fn(() => false),
    }

    async function* slowStream(): AsyncGenerator<StreamChunk> {
      await new Promise(resolve => setTimeout(resolve, 80))
      yield { type: 'delta', text: 'late' }
      yield { type: 'done', reply: 'late', llmLatencyMs: 80, totalLatencyMs: 80 }
    }

    const llm: LLMProvider = { streamTurn: vi.fn(() => slowStream()) }
    const turn = new TurnManager({ events, tts, llm, timeoutMs: 20 })
    const errors: Error[] = []
    events.on('error', error => {
      errors.push(error)
    })

    const reply = await turn.handleUserMessage('Test', { systemPrompt: 'test' }, [])

    expect(reply).toBe('')
    expect(tts.speak).toHaveBeenCalledWith(expect.stringContaining('Moment'))
    expect(errors[0]?.message).toContain('timed out')
  })

  it('limits the TTS queue depth by dropping older chunks', async () => {
    vi.useFakeTimers()
    const events = new VoiceEventEmitter()

    const tts: TTSProvider = {
      speak: vi.fn(() => new Promise<void>(resolve => {
        setTimeout(resolve, 10)
      })),
      stop: vi.fn(),
      isSpeaking: vi.fn(() => false),
    }

    async function* manyChunks(): AsyncGenerator<StreamChunk> {
      for (let index = 0; index < 20; index += 1) {
        yield { type: 'delta', text: `Satz ${index}. ` }
      }
      yield { type: 'done', reply: 'many', llmLatencyMs: 50, totalLatencyMs: 100 }
    }

    const llm: LLMProvider = { streamTurn: vi.fn(() => manyChunks()) }
    const turn = new TurnManager({ events, tts, llm, maxQueueDepth: 5 })

    const handlePromise = turn.handleUserMessage('Test', { systemPrompt: 'test' }, [])
    await vi.runAllTimersAsync()
    await handlePromise

    expect((tts.speak as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(6)
  })
})
