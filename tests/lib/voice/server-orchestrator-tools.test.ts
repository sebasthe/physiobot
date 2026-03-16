import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anthropic } from '@/lib/claude/client'
import { buildDrMiaSystemPrompt } from '@/lib/claude/prompts'
import { streamVoiceTurnOrchestration } from '@/lib/voice/server-orchestrator'
import type { ToolDefinition, WorkoutState } from '@/lib/voice-module/core/types'

const { mockGetSessionSnapshot, mockSelectCoachMode, mockShouldProbeMotivation } = vi.hoisted(() => ({
  mockGetSessionSnapshot: vi.fn(),
  mockSelectCoachMode: vi.fn(),
  mockShouldProbeMotivation: vi.fn(),
}))

vi.mock('@/lib/claude/client', () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/claude/prompts', () => ({
  buildDrMiaSystemPrompt: vi.fn(() => 'system prompt'),
}))

vi.mock('@/lib/coach/policy-prompts', () => ({
  buildCoachPolicyPrompt: vi.fn(() => 'coach policy'),
}))

vi.mock('@/lib/coach/mode-selector', () => ({
  selectCoachMode: mockSelectCoachMode,
  getModelForMode: vi.fn((mode: string) => mode === 'safety' || mode === 'motivation'
    ? 'claude-sonnet-4-5-20241022'
    : 'claude-haiku-4-5-20251001'),
  shouldProbeMotivation: mockShouldProbeMotivation,
}))

vi.mock('@/lib/memory/resolver', () => ({
  MemoryResolver: vi.fn().mockImplementation(() => ({
    getSessionSnapshot: mockGetSessionSnapshot,
  })),
}))

const tools: ToolDefinition[] = [
  {
    name: 'next_exercise',
    description: 'Advance to the next exercise',
    input_schema: { type: 'object', properties: {} },
  },
]

const workoutState: WorkoutState = {
  sessionId: 'session-1',
  status: 'active',
  currentExerciseIndex: 0,
  startedAt: new Date().toISOString(),
  exercises: [
    {
      id: 'ex-1',
      name: 'Squat',
      phase: 'main',
      type: 'reps',
      targetSets: 3,
      targetReps: 10,
      completedSets: 2,
      status: 'active',
    },
  ],
}

function createSupabaseStub() {
  return {
    from(table: string) {
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [] }),
              }),
            }),
          }),
        }
      }

      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { name: 'Test User' } }),
            }),
          }),
        }
      }

      if (table === 'user_personality') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  coach_persona: 'calm_coach',
                  feedback_style: 'gentle',
                  language: 'de',
                },
              }),
            }),
          }),
        }
      }

      if (table === 'streaks') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { current: 2 } }),
            }),
          }),
        }
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { complaints: ['neck'] } }),
          }),
        }),
      }
    },
  }
}

describe('server orchestrator tool_use', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSessionSnapshot.mockResolvedValue({
      kernMotivation: null,
      personalityPrefs: null,
      trainingPatterns: null,
      lifeContext: [],
      sessionCount: 1,
    })
    mockSelectCoachMode.mockReturnValue('performance')
    mockShouldProbeMotivation.mockReturnValue(false)
  })

  it('streams tool_call chunks when Claude uses tools', async () => {
    const createMock = vi.mocked(anthropic.messages.create)
    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_start', content_block: { type: 'tool_use', name: 'next_exercise' } }
        yield { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } }
        yield { type: 'content_block_stop' }
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Weiter!' } }
      },
    } as never)

    const chunks = []
    for await (const chunk of streamVoiceTurnOrchestration(createSupabaseStub(), {
      userId: 'test-user',
      messages: [],
      tools,
      workoutState,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toContainEqual({ type: 'tool_call', name: 'next_exercise', input: {} })
    expect(chunks).toContainEqual({ type: 'delta', text: 'Weiter!' })
    expect(chunks.at(-1)).toEqual(expect.objectContaining({ type: 'done', reply: 'Weiter!' }))
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-haiku-4-5-20251001',
      tools: [
        expect.objectContaining({
          name: 'next_exercise',
          description: 'Advance to the next exercise',
        }),
      ],
    }))
  })

  it('uses the safety model when safety mode is selected', async () => {
    const createMock = vi.mocked(anthropic.messages.create)
    mockSelectCoachMode.mockReturnValue('safety')
    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Bitte stoppen.' } }
      },
    } as never)

    const chunks = []
    for await (const chunk of streamVoiceTurnOrchestration(createSupabaseStub(), {
      userId: 'test-user',
      messages: [{ role: 'user', content: 'Das tut weh' }],
      currentExercise: { name: 'Squat', phase: 'main' },
      exercisePhase: 'main',
      exerciseStatus: 'active',
      sessionNumber: 2,
      workoutState,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toContainEqual({ type: 'delta', text: 'Bitte stoppen.' })
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-sonnet-4-5-20241022',
    }))
  })

  it('passes user personality into the live coach system prompt', async () => {
    const createMock = vi.mocked(anthropic.messages.create)
    const buildPromptMock = vi.mocked(buildDrMiaSystemPrompt)

    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Weiter so.' } }
      },
    } as never)

    for await (const _chunk of streamVoiceTurnOrchestration(createSupabaseStub(), {
      userId: 'test-user',
      messages: [{ role: 'user', content: 'Ich bin bereit' }],
      currentExercise: { name: 'Squat', description: 'Stay tall', phase: 'main' },
      exercisePhase: 'main',
      exerciseStatus: 'active',
      sessionNumber: 3,
      workoutState,
    })) {
      // exhaust stream
    }

    expect(buildPromptMock).toHaveBeenCalledWith(expect.objectContaining({
      personality: {
        coach_persona: 'calm_coach',
        feedback_style: 'gentle',
        language: 'de',
      },
    }))
  })

  it('lets the runtime request override the live coach language', async () => {
    const createMock = vi.mocked(anthropic.messages.create)
    const buildPromptMock = vi.mocked(buildDrMiaSystemPrompt)

    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Keep going.' } }
      },
    } as never)

    for await (const _chunk of streamVoiceTurnOrchestration(createSupabaseStub(), {
      userId: 'test-user',
      messages: [{ role: 'user', content: 'Ready' }],
      currentExercise: { name: 'Squat', description: 'Stay tall', phase: 'main' },
      exercisePhase: 'main',
      exerciseStatus: 'active',
      sessionNumber: 3,
      workoutState,
      language: 'en',
    })) {
      // exhaust stream
    }

    expect(buildPromptMock).toHaveBeenCalledWith(expect.objectContaining({
      personality: {
        coach_persona: 'calm_coach',
        feedback_style: 'gentle',
        language: 'en',
      },
    }))
  })
})
