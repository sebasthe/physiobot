import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anthropic } from '@/lib/claude/client'
import { streamVoiceTurnOrchestration } from '@/lib/voice/server-orchestrator'
import type { ToolDefinition, WorkoutState } from '@/lib/voice-module/core/types'

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

vi.mock('@/lib/mem0', () => ({
  getSessionContext: vi.fn().mockResolvedValue({
    kernMotivation: null,
    personalityHints: [],
    patternHints: [],
    lifeContext: [],
  }),
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
      tools: [
        expect.objectContaining({
          name: 'next_exercise',
          description: 'Advance to the next exercise',
        }),
      ],
    }))
  })
})
