import { describe, expect, it, vi } from 'vitest'
import { VoiceSession } from '@/lib/voice-module/core/VoiceSession'
import { executeToolCall, validateToolCall } from '@/lib/voice-module/tools/workout-tools'
import type { StreamChunk, VoiceConfig, WorkoutState } from '@/lib/voice-module/core/types'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'
import type { STTProvider } from '@/lib/voice-module/providers/stt/STTProvider'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'

const nullSTT: STTProvider = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isActive: () => false,
  onListeningStateChange: null,
  onPartialTranscript: null,
  onCommittedTranscript: null,
  onError: null,
}

const spokenTexts: string[] = []
const nullTTS: TTSProvider = {
  speak: vi.fn(async (text: string) => {
    spokenTexts.push(text)
  }),
  stop: vi.fn(),
  isSpeaking: () => false,
}

const config: VoiceConfig = {
  stt: 'none',
  tts: 'browser',
  llmEndpoint: '',
  autoListen: false,
  language: 'de-DE',
}

describe('Voice session full flow (text-only)', () => {
  it('processes a message and speaks the response', async () => {
    async function* stream(): AsyncGenerator<StreamChunk> {
      yield { type: 'delta', text: 'Los gehts!' }
      yield { type: 'done', reply: 'Los gehts!', llmLatencyMs: 50, totalLatencyMs: 100 }
    }

    const llm: LLMProvider = { streamTurn: vi.fn(() => stream()) }
    const session = new VoiceSession({
      config,
      stt: nullSTT,
      tts: nullTTS,
      llm,
    })

    spokenTexts.length = 0
    await session.sendMessage('Bereit', { systemPrompt: 'test' })

    expect(spokenTexts).toContain('Los gehts!')
    session.destroy()
  })

  it('emits tool calls and validates against workout state', async () => {
    async function* toolStream(): AsyncGenerator<StreamChunk> {
      yield { type: 'tool_call', name: 'next_exercise', input: {} }
      yield { type: 'delta', text: 'Naechste Uebung!' }
      yield { type: 'done', reply: 'Naechste Uebung!', llmLatencyMs: 50, totalLatencyMs: 100 }
    }

    const llm: LLMProvider = { streamTurn: vi.fn(() => toolStream()) }
    const session = new VoiceSession({
      config,
      stt: nullSTT,
      tts: nullTTS,
      llm,
    })

    let workoutState: WorkoutState = {
      sessionId: 'test',
      status: 'active',
      currentExerciseIndex: 0,
      startedAt: new Date().toISOString(),
      exercises: [
        {
          id: 'ex1',
          name: 'Squats',
          phase: 'main',
          type: 'reps',
          targetSets: 3,
          targetReps: 10,
          completedSets: 3,
          status: 'completed',
        },
        {
          id: 'ex2',
          name: 'Plank',
          phase: 'main',
          type: 'timed',
          targetDuration: 60,
          completedSets: 0,
          remainingSeconds: 60,
          status: 'pending',
        },
      ],
    }

    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = []
    session.on('toolCall', tool => {
      toolCalls.push(tool)
      const validation = validateToolCall(tool.name, tool.input, workoutState)
      if (validation.valid) {
        workoutState = executeToolCall(tool.name, tool.input, workoutState)
      }
    })

    await session.sendMessage('Naechste', { systemPrompt: 'test' })

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]?.name).toBe('next_exercise')
    expect(workoutState.currentExerciseIndex).toBe(1)
    expect(workoutState.exercises[1]?.status).toBe('active')
    session.destroy()
  })
})
