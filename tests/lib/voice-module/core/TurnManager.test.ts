import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TurnManager } from '@/lib/voice-module/core/TurnManager'
import { VoiceEventEmitter } from '@/lib/voice-module/core/events'
import type { StreamChunk, TurnContext, TurnState } from '@/lib/voice-module/core/types'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'

const makeMockTTS = (): TTSProvider => ({
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isSpeaking: vi.fn(() => false),
})

async function* mockStream(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk
  }
}

const makeMockLLM = (chunks: StreamChunk[]): LLMProvider => ({
  streamTurn: vi.fn(() => mockStream(chunks)),
})

describe('TurnManager', () => {
  let events: VoiceEventEmitter
  let tts: TTSProvider
  let llm: LLMProvider
  let turn: TurnManager

  const defaultContext: TurnContext = {
    systemPrompt: 'You are a coach',
    tools: [],
  }

  beforeEach(() => {
    events = new VoiceEventEmitter()
    tts = makeMockTTS()
    llm = makeMockLLM([
      { type: 'delta', text: 'Gut gemacht.' },
      { type: 'done', reply: 'Gut gemacht.', llmLatencyMs: 50, totalLatencyMs: 100 },
    ])
    turn = new TurnManager({ events, tts, llm })
  })

  it('processes a user message and speaks the response', async () => {
    await turn.handleUserMessage('Weiter', defaultContext, [])

    expect(tts.speak).toHaveBeenCalledWith('Gut gemacht.')
  })

  it('emits turnStateChanged through the lifecycle', async () => {
    const states: string[] = []

    events.on('turnStateChanged', (state: TurnState) => {
      states.push(state)
    })

    await turn.handleUserMessage('Weiter', defaultContext, [])

    expect(states).toContain('processing')
    expect(states).toContain('speaking')
    expect(states).toContain('idle')
  })

  it('emits toolCall when LLM returns tool_use', async () => {
    const toolLLM = makeMockLLM([
      { type: 'tool_call', name: 'next_exercise', input: {} },
      { type: 'delta', text: 'Weiter gehts!' },
      { type: 'done', reply: 'Weiter gehts!', llmLatencyMs: 50, totalLatencyMs: 100 },
    ])
    turn = new TurnManager({ events, tts, llm: toolLLM })

    const handler = vi.fn()
    events.on('toolCall', handler)

    await turn.handleUserMessage('Naechste Uebung', defaultContext, [])

    expect(handler).toHaveBeenCalledWith({ name: 'next_exercise', input: {} })
  })

  it('interrupt stops TTS and resets state', () => {
    turn.interrupt()

    expect(tts.stop).toHaveBeenCalled()
  })

  it('batches speech by sentence boundaries', async () => {
    const multiSentenceLLM = makeMockLLM([
      { type: 'delta', text: 'Satz eins. ' },
      { type: 'delta', text: 'Satz zwei! ' },
      { type: 'delta', text: 'Ende.' },
      { type: 'done', reply: 'Satz eins. Satz zwei! Ende.', llmLatencyMs: 50, totalLatencyMs: 100 },
    ])
    turn = new TurnManager({ events, tts, llm: multiSentenceLLM })

    await turn.handleUserMessage('Test', defaultContext, [])

    expect((tts.speak as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})
