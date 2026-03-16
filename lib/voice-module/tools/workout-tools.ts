import type { ToolDefinition, WorkoutState } from '../core/types'

export const WORKOUT_TOOLS: ToolDefinition[] = [
  {
    name: 'next_exercise',
    description: 'Advance to the next exercise in the plan',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'previous_exercise',
    description: 'Go back to the previous exercise',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'pause_workout',
    description: 'Pause the current workout timer',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'resume_workout',
    description: 'Resume a paused workout',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'mark_set_complete',
    description: 'Mark the current set as completed for rep-based exercises',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'adjust_timer',
    description: 'Adjust the remaining time for the current exercise',
    input_schema: {
      type: 'object',
      properties: {
        delta: {
          type: 'number',
          description: 'Seconds to add or remove from the timer',
        },
      },
      required: ['delta'],
    },
  },
  {
    name: 'end_session',
    description: 'End the workout session early',
    input_schema: { type: 'object', properties: {} },
  },
]

interface ValidationResult {
  valid: boolean
  reason?: string
}

export function validateToolCall(
  name: string,
  _input: Record<string, unknown>,
  state: WorkoutState,
): ValidationResult {
  const current = state.exercises[state.currentExerciseIndex]
  const knownTool = WORKOUT_TOOLS.some(tool => tool.name === name)

  if (!knownTool) {
    return { valid: false, reason: `Unknown tool: ${name}` }
  }

  if (!current && name !== 'end_session') {
    return { valid: false, reason: 'No current exercise available' }
  }

  switch (name) {
    case 'next_exercise':
      if (state.currentExerciseIndex >= state.exercises.length - 1) {
        return { valid: false, reason: 'Already at the last exercise' }
      }
      if (current?.status !== 'completed' && current?.status !== 'skipped') {
        return { valid: false, reason: 'Current exercise is not completed yet' }
      }
      return { valid: true }
    case 'previous_exercise':
      return state.currentExerciseIndex > 0
        ? { valid: true }
        : { valid: false, reason: 'Already at the first exercise' }
    case 'pause_workout':
      return state.status === 'active'
        ? { valid: true }
        : { valid: false, reason: 'Workout is not active' }
    case 'resume_workout':
      return state.status === 'paused'
        ? { valid: true }
        : { valid: false, reason: 'Workout is not paused' }
    case 'mark_set_complete':
      if (current?.type !== 'reps') {
        return { valid: false, reason: 'Current exercise is not rep-based' }
      }
      if (current.status !== 'active') {
        return { valid: false, reason: 'Current exercise is not active' }
      }
      return { valid: true }
    case 'adjust_timer':
      if (current?.type !== 'timed') {
        return { valid: false, reason: 'Current exercise is not timed' }
      }
      if (current.status !== 'active') {
        return { valid: false, reason: 'Current exercise is not active' }
      }
      return { valid: true }
    case 'end_session':
      return { valid: true }
    default:
      return { valid: false, reason: `Unhandled tool: ${name}` }
  }
}

export function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  state: WorkoutState,
): WorkoutState {
  const next = cloneWorkoutState(state)
  const current = next.exercises[next.currentExerciseIndex]

  switch (name) {
    case 'next_exercise': {
      next.currentExerciseIndex += 1
      const upcoming = next.exercises[next.currentExerciseIndex]
      if (upcoming) {
        upcoming.status = 'active'
      }
      return next
    }
    case 'previous_exercise': {
      if (current?.status === 'active') {
        current.status = 'pending'
      }
      next.currentExerciseIndex -= 1
      const previous = next.exercises[next.currentExerciseIndex]
      if (previous) {
        previous.status = 'active'
      }
      return next
    }
    case 'pause_workout':
      next.status = 'paused'
      return next
    case 'resume_workout':
      next.status = 'active'
      return next
    case 'mark_set_complete': {
      if (!current) return next
      current.completedSets += 1
      if (current.targetSets && current.completedSets >= current.targetSets) {
        current.status = 'completed'
      }
      return next
    }
    case 'adjust_timer': {
      if (!current) return next
      const delta = typeof input.delta === 'number' ? input.delta : 0
      current.remainingSeconds = Math.max(0, (current.remainingSeconds ?? 0) + delta)
      return next
    }
    case 'end_session':
      next.status = 'completed'
      return next
    default:
      return next
  }
}

function cloneWorkoutState(state: WorkoutState): WorkoutState {
  if (typeof structuredClone === 'function') {
    return structuredClone(state)
  }

  return JSON.parse(JSON.stringify(state)) as WorkoutState
}
