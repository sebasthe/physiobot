import { describe, expect, it } from 'vitest'
import { shouldProbeMotivation } from '@/lib/coach/mode-selector'
import { buildCoachPolicyPrompt } from '@/lib/coach/policy-prompts'
import type { CoachingMemorySnapshot } from '@/lib/coach/types'

describe('shouldProbeMotivation', () => {
  it('returns true in early sessions during rest', () => {
    expect(shouldProbeMotivation({
      sessionCount: 1,
      exerciseStatus: 'completed',
      kernMotivation: null,
    })).toBe(true)

    expect(shouldProbeMotivation({
      sessionCount: 3,
      exerciseStatus: 'completed',
      kernMotivation: null,
    })).toBe(true)
  })

  it('returns false after session three', () => {
    expect(shouldProbeMotivation({
      sessionCount: 4,
      exerciseStatus: 'completed',
      kernMotivation: null,
    })).toBe(false)
  })

  it('returns false during active exercise', () => {
    expect(shouldProbeMotivation({
      sessionCount: 1,
      exerciseStatus: 'active',
      kernMotivation: null,
    })).toBe(false)
  })

  it('returns false when kern motivation is already known', () => {
    expect(shouldProbeMotivation({
      sessionCount: 2,
      exerciseStatus: 'completed',
      kernMotivation: 'Fuer meine Kinder',
    })).toBe(false)
  })
})

describe('motivation reference in policy prompt', () => {
  it('keeps kern motivation visible in the safety prompt', () => {
    const memory: CoachingMemorySnapshot = {
      kernMotivation: 'Fuer meine Kinder da sein',
      personalityPrefs: null,
      trainingPatterns: null,
      lifeContext: [],
      sessionCount: 5,
    }

    const prompt = buildCoachPolicyPrompt('safety', memory)

    expect(prompt).toContain('Fuer meine Kinder da sein')
  })
})
