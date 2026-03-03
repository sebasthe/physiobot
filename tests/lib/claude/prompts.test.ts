import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildPlanRequestMessage } from '@/lib/claude/prompts'
import type { UserPersonality, HealthProfile } from '@/lib/types'

const personality: UserPersonality = {
  motivation_style: 'goal_oriented',
  feedback_style: 'energetic',
  language: 'de',
  coach_persona: 'tony_robbins',
}

const healthProfile: HealthProfile = {
  complaints: ['Rückenschmerzen'],
  goals: 'Rücken stärken',
  fitness_level: 'beginner',
  session_duration_minutes: 20,
  sessions_per_week: 3,
}

describe('buildSystemPrompt', () => {
  it('includes coach persona', () => {
    const prompt = buildSystemPrompt({ personality, memories: [] })
    expect(prompt).toContain('Tony Robbins')
  })

  it('includes language instruction', () => {
    const prompt = buildSystemPrompt({ personality, memories: [] })
    expect(prompt).toContain('Deutsch')
  })

  it('includes memories when provided', () => {
    const prompt = buildSystemPrompt({
      personality,
      memories: ['Nutzer hat Knieschmerzen links'],
    })
    expect(prompt).toContain('Knieschmerzen links')
  })
})

describe('buildPlanRequestMessage', () => {
  it('includes session duration', () => {
    const message = buildPlanRequestMessage({ healthProfile })
    expect(message).toContain('20')
  })

  it('includes complaints', () => {
    const message = buildPlanRequestMessage({ healthProfile })
    expect(message).toContain('Rückenschmerzen')
  })
})
