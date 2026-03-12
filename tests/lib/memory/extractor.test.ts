import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAnthropicCreate, mockMemAdd } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
  mockMemAdd: vi.fn(),
}))

vi.mock('@/lib/claude/client', () => ({
  anthropic: {
    messages: {
      create: mockAnthropicCreate,
    },
  },
}))

vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({
    add: mockMemAdd,
  })),
}))

import { extractSessionInsights } from '@/lib/memory/extractor'

describe('extractSessionInsights', () => {
  beforeEach(() => {
    mockMemAdd.mockReset()
    mockMemAdd.mockResolvedValue({ id: 'mem-1' })
    mockAnthropicCreate.mockReset()
    mockAnthropicCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          motivation_hints: ['Will fuer Kinder fit bleiben'],
          personality_preferences: {
            communicationStyle: 'direkt',
            encouragementType: 'challenge-driven',
          },
          training_patterns: {
            knownPainPoints: ['Schulter'],
            preferredExercises: ['Squats'],
            fatigueSignals: ['wird stiller'],
          },
          life_context: ['Buerojob', '2 Kinder'],
        }),
      }],
    })
  })

  it('extracts structured insights from a transcript', async () => {
    const transcript = [
      { role: 'user', content: 'Ich mache das fuer meine Kinder' },
      { role: 'assistant', content: 'Das ist eine starke Motivation.' },
    ]

    const insights = await extractSessionInsights('user-123', transcript)

    expect(insights.motivation_hints).toContain('Will fuer Kinder fit bleiben')
    expect(insights.training_patterns.knownPainPoints).toContain('Schulter')
    expect(insights.life_context).toContain('Buerojob')
  })

  it('stores extracted memories in Mem0', async () => {
    await extractSessionInsights('user-123', [
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Ok' },
    ])

    expect(mockMemAdd).toHaveBeenCalled()
  })
})
