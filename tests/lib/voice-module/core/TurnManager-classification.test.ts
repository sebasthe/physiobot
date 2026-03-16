import { describe, expect, it, vi } from 'vitest'
import { TurnManager } from '@/lib/voice-module/core/TurnManager'
import { VoiceEventEmitter } from '@/lib/voice-module/core/events'
import type { StreamChunk, TurnContext } from '@/lib/voice-module/core/types'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'

vi.mock('@/lib/coach/utterance-classifier', () => ({
  classifyUtterance: vi.fn().mockImplementation((text: string) => {
    if (text === 'Pause') {
      return Promise.resolve({ category: 'command', confidence: 1, fastPath: true, commandName: 'pause_workout' })
    }
    if (text === 'Ähm') {
      return Promise.resolve({ category: 'filler', confidence: 1, fastPath: true })
    }
    if (text === 'Ok') {
      return Promise.resolve({ category: 'acknowledgment', confidence: 1, fastPath: true })
    }
    return Promise.resolve({ category: 'question', confidence: 0.8, fastPath: false })
  }),
}))

const makeMockTTS = (): TTSProvider => ({
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isSpeaking: vi.fn(() => false),
})

async function* mockStream(): AsyncGenerator<StreamChunk> {
  yield { type: 'delta', text: 'Response' }
  yield { type: 'done', reply: 'Response', llmLatencyMs: 50, totalLatencyMs: 100 }
}

describe('TurnManager with classification', () => {
  const defaultContext: TurnContext = { systemPrompt: 'test' }

  it('skips the LLM for filler utterances', async () => {
    const events = new VoiceEventEmitter()
    const tts = makeMockTTS()
    const llm: LLMProvider = { streamTurn: vi.fn(() => mockStream()) }
    const turn = new TurnManager({ events, tts, llm, enableClassification: true })

    const reply = await turn.handleUserMessage('Ähm', defaultContext, [])

    expect(reply).toBe('')
    expect(llm.streamTurn).not.toHaveBeenCalled()
    expect(tts.speak).not.toHaveBeenCalled()
  })

  it('routes commands directly to toolCall events', async () => {
    const events = new VoiceEventEmitter()
    const tts = makeMockTTS()
    const llm: LLMProvider = { streamTurn: vi.fn(() => mockStream()) }
    const turn = new TurnManager({ events, tts, llm, enableClassification: true })

    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = []
    events.on('toolCall', tool => {
      toolCalls.push(tool)
    })

    const reply = await turn.handleUserMessage('Pause', defaultContext, [])

    expect(reply).toBe('')
    expect(toolCalls).toEqual([{ name: 'pause_workout', input: {} }])
    expect(llm.streamTurn).not.toHaveBeenCalled()
  })

  it('skips full LLM turns for acknowledgments', async () => {
    const events = new VoiceEventEmitter()
    const tts = makeMockTTS()
    const llm: LLMProvider = { streamTurn: vi.fn(() => mockStream()) }
    const turn = new TurnManager({ events, tts, llm, enableClassification: true })

    await turn.handleUserMessage('Ok', defaultContext, [])

    expect(llm.streamTurn).not.toHaveBeenCalled()
  })

  it('passes questions through to the full LLM turn', async () => {
    const events = new VoiceEventEmitter()
    const tts = makeMockTTS()
    const llm: LLMProvider = { streamTurn: vi.fn(() => mockStream()) }
    const turn = new TurnManager({ events, tts, llm, enableClassification: true })

    await turn.handleUserMessage('Wie mache ich das richtig?', defaultContext, [])

    expect(llm.streamTurn).toHaveBeenCalledTimes(1)
    expect(tts.speak).toHaveBeenCalledWith('Response')
  })
})
