import { describe, expect, it } from 'vitest'
import {
  WORKOUT_TOOLS,
  executeToolCall,
  validateToolCall,
} from '@/lib/voice-module/tools/workout-tools'
import type { WorkoutState } from '@/lib/voice-module/core/types'

const makeState = (overrides?: Partial<WorkoutState>): WorkoutState => ({
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
      completedSets: 2,
      status: 'active',
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
  ...overrides,
})

describe('WORKOUT_TOOLS', () => {
  it('exports tool definitions for Claude', () => {
    expect(WORKOUT_TOOLS).toHaveLength(8)
    expect(WORKOUT_TOOLS.map(tool => tool.name)).toContain('next_exercise')
    expect(WORKOUT_TOOLS.map(tool => tool.name)).toContain('pause_workout')
    expect(WORKOUT_TOOLS.map(tool => tool.name)).toContain('log_pain')
  })
})

describe('validateToolCall', () => {
  it('allows next_exercise when current is completed', () => {
    const state = makeState()
    state.exercises[0]!.status = 'completed'

    expect(validateToolCall('next_exercise', {}, state)).toEqual({ valid: true })
  })

  it('rejects next_exercise when current is active', () => {
    const result = validateToolCall('next_exercise', {}, makeState())

    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('rejects next_exercise when at last exercise', () => {
    const state = makeState({ currentExerciseIndex: 1 })
    state.exercises[1]!.status = 'completed'

    expect(validateToolCall('next_exercise', {}, state).valid).toBe(false)
  })

  it('allows pause_workout when active', () => {
    expect(validateToolCall('pause_workout', {}, makeState()).valid).toBe(true)
  })

  it('rejects pause_workout when already paused', () => {
    expect(validateToolCall('pause_workout', {}, makeState({ status: 'paused' })).valid).toBe(false)
  })

  it('allows mark_set_complete on reps exercise', () => {
    expect(validateToolCall('mark_set_complete', {}, makeState()).valid).toBe(true)
  })

  it('rejects mark_set_complete on timed exercise', () => {
    const state = makeState({ currentExerciseIndex: 1 })
    state.exercises[1]!.status = 'active'

    expect(validateToolCall('mark_set_complete', {}, state).valid).toBe(false)
  })

  it('rejects unknown tool', () => {
    expect(validateToolCall('fly_away', {}, makeState()).valid).toBe(false)
  })
})

describe('executeToolCall', () => {
  it('next_exercise advances index and marks next active', () => {
    const state = makeState()
    state.exercises[0]!.status = 'completed'

    const next = executeToolCall('next_exercise', {}, state)

    expect(next.currentExerciseIndex).toBe(1)
    expect(next.exercises[1]!.status).toBe('active')
  })

  it('pause_workout sets status to paused', () => {
    expect(executeToolCall('pause_workout', {}, makeState()).status).toBe('paused')
  })

  it('resume_workout sets status to active', () => {
    const state = makeState({ status: 'paused' })

    expect(executeToolCall('resume_workout', {}, state).status).toBe('active')
  })

  it('mark_set_complete increments completedSets', () => {
    const next = executeToolCall('mark_set_complete', {}, makeState())

    expect(next.exercises[0]!.completedSets).toBe(3)
  })

  it('mark_set_complete auto-completes exercise when all sets done', () => {
    const next = executeToolCall('mark_set_complete', {}, makeState())

    expect(next.exercises[0]!.status).toBe('completed')
  })

  it('adjust_timer modifies remainingSeconds', () => {
    const state = makeState({ currentExerciseIndex: 1 })
    state.exercises[1]!.status = 'active'

    const next = executeToolCall('adjust_timer', { delta: -15 }, state)

    expect(next.exercises[1]!.remainingSeconds).toBe(45)
  })

  it('end_session sets status to completed', () => {
    expect(executeToolCall('end_session', {}, makeState()).status).toBe('completed')
  })
})
