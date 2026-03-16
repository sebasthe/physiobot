import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useVoiceSession } from '@/lib/voice-module/react/useVoiceSession'
import type { StreamChunk, VoiceConfig } from '@/lib/voice-module/core/types'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'
import type { STTProvider } from '@/lib/voice-module/providers/stt/STTProvider'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'

const makeMockSTT = (): STTProvider => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isActive: vi.fn(() => false),
  onListeningStateChange: null,
  onPartialTranscript: null,
  onCommittedTranscript: null,
  onError: null,
})

const makeMockTTS = (): TTSProvider => ({
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isSpeaking: vi.fn(() => false),
})

async function* mockStream(): AsyncGenerator<StreamChunk> {
  yield { type: 'delta', text: 'Hi!' }
  yield { type: 'done', reply: 'Hi!', llmLatencyMs: 50, totalLatencyMs: 100 }
}

const makeMockLLM = (): LLMProvider => ({
  streamTurn: vi.fn(() => mockStream()),
})

describe('useVoiceSession', () => {
  const config: VoiceConfig = {
    stt: 'browser',
    tts: 'browser',
    llmEndpoint: '/api/voice/realtime/stream',
    autoListen: false,
    language: 'de-DE',
  }

  it('returns turnState, transcript, and control functions', () => {
    const { result } = renderHook(() =>
      useVoiceSession({ config, stt: makeMockSTT(), tts: makeMockTTS(), llm: makeMockLLM() }),
    )

    expect(result.current.turnState).toBe('idle')
    expect(result.current.transcript).toEqual([])
    expect(result.current.sendMessage).toBeDefined()
    expect(result.current.startListening).toBeDefined()
    expect(result.current.stopListening).toBeDefined()
    expect(result.current.interrupt).toBeDefined()
  })

  it('updates transcript on sendMessage', async () => {
    const { result } = renderHook(() =>
      useVoiceSession({ config, stt: makeMockSTT(), tts: makeMockTTS(), llm: makeMockLLM() }),
    )

    await act(async () => {
      await result.current.sendMessage('Hello', { systemPrompt: 'test' })
    })

    expect(result.current.turnState).toBe('idle')
    expect(result.current.transcript.length).toBeGreaterThan(0)
  })

  it('forwards metrics events to the provided callback', async () => {
    const onMetrics = vi.fn()
    const { result } = renderHook(() =>
      useVoiceSession({ config, stt: makeMockSTT(), tts: makeMockTTS(), llm: makeMockLLM(), onMetrics }),
    )

    await act(async () => {
      await result.current.sendMessage('Hello', { systemPrompt: 'test' })
    })

    expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({
      utteranceCategory: 'question',
    }))
  })

  it('does not destroy the session on a normal rerender', () => {
    const stt = makeMockSTT()
    const tts = makeMockTTS()
    const llm = makeMockLLM()
    const { rerender, unmount } = renderHook(() =>
      useVoiceSession({ config, stt, tts, llm }),
    )

    rerender()

    expect(stt.stop).not.toHaveBeenCalled()
    expect(tts.stop).not.toHaveBeenCalled()

    unmount()

    expect(stt.stop).toHaveBeenCalledTimes(1)
    expect(tts.stop).toHaveBeenCalledTimes(1)
  })
})
