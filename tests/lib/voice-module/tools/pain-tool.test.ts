import { describe, expect, it } from 'vitest'
import { WORKOUT_TOOLS } from '@/lib/voice-module/tools/workout-tools'

describe('pain reporting tool', () => {
  it('includes the log_pain tool', () => {
    const painTool = WORKOUT_TOOLS.find(tool => tool.name === 'log_pain')

    expect(painTool).toBeDefined()
    expect(painTool?.input_schema).toHaveProperty('properties')
  })
})
