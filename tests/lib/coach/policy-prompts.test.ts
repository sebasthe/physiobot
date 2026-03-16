import { describe, expect, it } from 'vitest'
import { buildCoachPolicyPrompt } from '@/lib/coach/policy-prompts'
import type { CoachingMemorySnapshot } from '@/lib/coach/types'

const memory: CoachingMemorySnapshot = {
  kernMotivation: 'Fuer meine Kinder da sein',
  personalityPrefs: {
    communicationStyle: 'direkt',
    encouragementType: 'challenge-driven',
  },
  trainingPatterns: {
    knownPainPoints: ['Schulter'],
    preferredExercises: [],
    fatigueSignals: [],
  },
  lifeContext: ['Buerojob'],
  sessionCount: 5,
}

describe('buildCoachPolicyPrompt', () => {
  it('performance mode produces short instructions', () => {
    const prompt = buildCoachPolicyPrompt('performance', memory)

    expect(prompt).toContain('kurz')
    expect(prompt).toContain('maximal 1-2 Saetze')
  })

  it('guidance mode includes technique help', () => {
    const prompt = buildCoachPolicyPrompt('guidance', memory)

    expect(prompt).toContain('Technik')
  })

  it('safety mode includes stop instructions', () => {
    const prompt = buildCoachPolicyPrompt('safety', memory)

    expect(prompt).toContain('Sicherheit')
    expect(prompt).toContain('stopp')
  })

  it('motivation mode includes Why probing', () => {
    const prompt = buildCoachPolicyPrompt('motivation', memory)

    expect(prompt).toContain('Warum')
  })

  it('injects memory context when available', () => {
    const prompt = buildCoachPolicyPrompt('performance', memory)

    expect(prompt).toContain('Fuer meine Kinder da sein')
  })

  it('handles empty memory gracefully', () => {
    const prompt = buildCoachPolicyPrompt('performance', {
      kernMotivation: null,
      personalityPrefs: null,
      trainingPatterns: null,
      lifeContext: [],
      sessionCount: 1,
    })

    expect(prompt.length).toBeGreaterThan(0)
  })
})
