import { describe, expect, it } from 'vitest'
import type {
  ExerciseState,
  StreamChunk,
  ToolDefinition,
  TurnContext,
  TurnState,
  VoiceConfig,
  WorkoutState,
} from '@/lib/voice-module/core/types'

describe('voice-module types', () => {
  it('VoiceConfig has required fields', () => {
    const config: VoiceConfig = {
      stt: 'elevenlabs',
      tts: 'elevenlabs',
      llmEndpoint: '/api/voice/realtime/stream',
      autoListen: true,
      language: 'de-DE',
    }

    expect(config.stt).toBe('elevenlabs')
    expect(config.language).toBe('de-DE')
  })

  it('TurnContext accepts tools', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'next_exercise',
        description: 'Advance to next exercise',
        input_schema: { type: 'object', properties: {} },
      },
    ]

    const ctx: TurnContext = {
      systemPrompt: 'You are a coach',
      tools,
      metadata: { exerciseIndex: 0 },
    }

    expect(ctx.tools).toHaveLength(1)
  })

  it('WorkoutState tracks exercise progression', () => {
    const exercise: ExerciseState = {
      id: 'ex1',
      name: 'Squats',
      phase: 'main',
      type: 'reps',
      targetSets: 3,
      targetReps: 10,
      completedSets: 0,
      status: 'active',
    }

    const state: WorkoutState = {
      sessionId: 'abc',
      status: 'active',
      currentExerciseIndex: 0,
      startedAt: new Date().toISOString(),
      exercises: [exercise],
    }

    expect(state.exercises[0]?.status).toBe('active')
  })

  it('StreamChunk discriminated union works', () => {
    const delta: StreamChunk = { type: 'delta', text: 'Hello' }
    const tool: StreamChunk = { type: 'tool_call', name: 'pause_workout', input: {} }
    const done: StreamChunk = { type: 'done', reply: 'Hello', llmLatencyMs: 100, totalLatencyMs: 200 }

    expect(delta.type).toBe('delta')
    expect(tool.type).toBe('tool_call')
    expect(done.type).toBe('done')
  })

  it('TurnState covers all voice states', () => {
    const states: TurnState[] = ['idle', 'listening', 'processing', 'speaking']

    expect(states).toHaveLength(4)
  })
})
