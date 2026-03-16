import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAnthropicCreate, mockMemAdd, mockLogPrivacyAuditEvent } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
  mockMemAdd: vi.fn(),
  mockLogPrivacyAuditEvent: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/privacy/audit', () => ({
  logPrivacyAuditEvent: mockLogPrivacyAuditEvent,
}))

import { extractSessionInsights } from '@/lib/memory/extractor'

describe('memory extractor with privacy', () => {
  beforeEach(() => {
    mockMemAdd.mockReset()
    mockMemAdd.mockResolvedValue({ id: 'mem-1' })
    mockLogPrivacyAuditEvent.mockClear()
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
            knownPainPoints: ['Stechender Schmerz im Knie seit 2 Wochen'],
            preferredExercises: [],
            fatigueSignals: [],
          },
          life_context: ['Buerojob'],
        }),
      }],
    })
  })

  it('classifies each stored memory entry', async () => {
    await extractSessionInsights('user-123', [
      { role: 'user', content: 'Ich mache das fuer meine Kinder' },
      { role: 'assistant', content: 'Das ist stark.' },
    ], 'full')

    expect(mockMemAdd).toHaveBeenCalled()
    for (const call of mockMemAdd.mock.calls) {
      expect(call[1]?.metadata).toHaveProperty('data_class')
      expect(call[1]?.metadata).toHaveProperty('category')
    }
    expect(mockLogPrivacyAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'class_d_write',
    }))
  })

  it('skips storage when consent is minimal', async () => {
    await extractSessionInsights('user-123', [
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Ok' },
    ], 'minimal')

    expect(mockMemAdd).not.toHaveBeenCalled()
  })
})
