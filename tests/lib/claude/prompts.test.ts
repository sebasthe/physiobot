import { describe, it, expect } from 'vitest'
import { buildDrMiaSystemPrompt, buildPlanRequestMessage, buildSystemPrompt } from '@/lib/claude/prompts'
import type { SessionMemoryContext } from '@/lib/mem0'
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

const memoryContext: SessionMemoryContext = {
  kernMotivation: null,
  personalityHints: [],
  patternHints: [],
  lifeContext: [],
}

describe('buildSystemPrompt', () => {
  it('includes coach persona', () => {
    const prompt = buildSystemPrompt({ personality, memories: [] })
    expect(prompt).toContain('motivierender Coach')
  })

  it('includes language instruction', () => {
    const prompt = buildSystemPrompt({ personality, memories: [] })
    expect(prompt).toContain('German')
  })

  it('includes memories when provided', () => {
    const prompt = buildSystemPrompt({
      personality,
      memories: ['Nutzer hat Knieschmerzen links'],
    })
    expect(prompt).toContain('Knieschmerzen links')
  })

  it('switches the system prompt to English when the user language is English', () => {
    const prompt = buildSystemPrompt({
      personality: {
        ...personality,
        language: 'en',
      },
      memories: [],
    })

    expect(prompt).toContain('Always respond in English')
    expect(prompt).not.toContain('Duze den Nutzer')
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

  it('switches voice_script instructions to English when requested', () => {
    const message = buildPlanRequestMessage({ healthProfile, language: 'en' })
    expect(message).toContain('Natural coaching text in English')
  })
})

describe('buildDrMiaSystemPrompt', () => {
  it('produces an English live-coach prompt when English is requested', () => {
    const prompt = buildDrMiaSystemPrompt({
      userName: 'Sam',
      streak: 4,
      bodyAreas: ['neck'],
      memoryContext,
      personality: {
        coach_persona: 'calm_coach',
        feedback_style: 'gentle',
        language: 'en',
      },
      timeOfDay: 'morning',
      sessionNumber: 2,
    })

    expect(prompt).toContain('Respond naturally in English')
    expect(prompt).toContain('Body areas: neck')
    expect(prompt).not.toContain('Antworte natuerlich auf Deutsch')
  })
})
