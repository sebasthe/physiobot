import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceSession } from '@/lib/voice-module/core/VoiceSession'
import type { StreamChunk, TurnContext, VoiceConfig } from '@/lib/voice-module/core/types'
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
  yield { type: 'delta', text: 'Ok!' }
  yield { type: 'done', reply: 'Ok!', llmLatencyMs: 50, totalLatencyMs: 100 }
}

const makeMockLLM = (): LLMProvider => ({
  streamTurn: vi.fn(() => mockStream()),
})

describe('VoiceSession', () => {
  let session: VoiceSession
  let stt: STTProvider
  let tts: TTSProvider
  let llm: LLMProvider

  const config: VoiceConfig = {
    stt: 'browser',
    tts: 'browser',
    llmEndpoint: '/api/voice/realtime/stream',
    autoListen: false,
    language: 'de-DE',
  }

  const turnContext: TurnContext = {
    systemPrompt: 'You are a coach',
  }

  beforeEach(() => {
    vi.useRealTimers()
    stt = makeMockSTT()
    tts = makeMockTTS()
    llm = makeMockLLM()
    session = new VoiceSession({ config, stt, tts, llm })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in idle state', () => {
    expect(session.getState()).toBe('idle')
  })

  it('exposes event emitter for external listeners', async () => {
    const handler = vi.fn()
    session.on('turnStateChanged', handler)

    await session.sendMessage('Hallo', turnContext)

    expect(handler).toHaveBeenCalled()
  })

  it('startListening activates STT', async () => {
    await session.startListening()

    expect(stt.start).toHaveBeenCalled()
  })

  it('stopListening deactivates STT', async () => {
    await session.startListening()
    session.stopListening()

    expect(stt.stop).toHaveBeenCalled()
  })

  it('returns to idle when the STT provider reports listening stopped', async () => {
    await session.startListening()

    stt.onListeningStateChange?.(false)

    expect(session.getState()).toBe('idle')
  })

  it('sendMessage processes through TurnManager', async () => {
    await session.sendMessage('Test', turnContext)

    expect(llm.streamTurn).toHaveBeenCalled()
    expect(tts.speak).toHaveBeenCalled()
  })

  it('interrupt stops everything', () => {
    session.interrupt()

    expect(tts.stop).toHaveBeenCalled()
  })

  it('destroy cleans up all resources', () => {
    session.destroy()

    expect(stt.stop).toHaveBeenCalled()
    expect(tts.stop).toHaveBeenCalled()
  })

  it('toolCall events are forwarded', async () => {
    async function* toolStream(): AsyncGenerator<StreamChunk> {
      yield { type: 'tool_call', name: 'pause_workout', input: {} }
      yield { type: 'delta', text: 'Paused.' }
      yield { type: 'done', reply: 'Paused.', llmLatencyMs: 50, totalLatencyMs: 100 }
    }

    const toolLLM: LLMProvider = {
      streamTurn: vi.fn(() => toolStream()),
    }
    session = new VoiceSession({ config, stt, tts, llm: toolLLM })

    const handler = vi.fn()
    session.on('toolCall', handler)

    await session.sendMessage('Pause', turnContext)

    expect(handler).toHaveBeenCalledWith({ name: 'pause_workout', input: {} })
  })

  it('requests a repeat for very short garbled transcripts', async () => {
    vi.useFakeTimers()
    stt = makeMockSTT()
    tts = makeMockTTS()
    llm = makeMockLLM()
    session = new VoiceSession({ config, stt, tts, llm })

    stt.onCommittedTranscript?.('x')
    await vi.advanceTimersByTimeAsync(300)

    expect(tts.speak).toHaveBeenCalledWith('Kannst du das nochmal sagen?')
  })

  it('debounces rapid duplicate committed transcripts', async () => {
    vi.useFakeTimers()
    stt = makeMockSTT()
    tts = makeMockTTS()
    llm = makeMockLLM()
    session = new VoiceSession({ config, stt, tts, llm })

    const handler = vi.fn()
    session.on('committedTranscript', handler)

    stt.onCommittedTranscript?.('Hallo')
    stt.onCommittedTranscript?.('Hallo')
    await vi.advanceTimersByTimeAsync(300)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('Hallo')
  })

  it('nudges and eventually pauses the workout after long silence', async () => {
    vi.useFakeTimers()
    stt = makeMockSTT()
    tts = makeMockTTS()
    llm = makeMockLLM()
    session = new VoiceSession({ config, stt, tts, llm })

    const toolHandler = vi.fn()
    session.on('toolCall', toolHandler)

    await session.sendMessage('Test', turnContext)
    await vi.advanceTimersByTimeAsync(30_000)

    expect(tts.speak).toHaveBeenCalledWith('Alles gut bei dir?')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(tts.speak).toHaveBeenCalledWith('Alles ok? Sag Bescheid wenn du Hilfe brauchst.')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(toolHandler).toHaveBeenCalledWith({ name: 'pause_workout', input: {} })
  })
})
