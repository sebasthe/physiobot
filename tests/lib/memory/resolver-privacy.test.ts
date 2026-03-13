import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSearch, mockLogPrivacyAuditEvent } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockLogPrivacyAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({
    search: mockSearch,
  })),
}))

vi.mock('@/lib/privacy/audit', () => ({
  logPrivacyAuditEvent: mockLogPrivacyAuditEvent,
}))

import { MemoryResolver } from '@/lib/memory/resolver'

describe('MemoryResolver with privacy', () => {
  beforeEach(() => {
    mockSearch.mockReset()
    mockLogPrivacyAuditEvent.mockClear()
    mockSearch.mockImplementation((query: string) => {
      if (query.includes('Motivation')) {
        return Promise.resolve([{ memory: 'Motivation: Fuer meine Kinder', metadata: { data_class: 'C' } }])
      }
      if (query.includes('Persoenlichkeit')) {
        return Promise.resolve([{ memory: 'Kommunikationsstil: direkt', metadata: { data_class: 'B' } }])
      }
      if (query.includes('Trainingsmuster')) {
        return Promise.resolve([{ memory: 'Schmerzpunkte: Stechender Schmerz im Knie', metadata: { data_class: 'D' } }])
      }
      if (query.includes('Lebenskontext')) {
        return Promise.resolve([{ memory: 'Lebenskontext: Buerojob', metadata: { data_class: 'C' } }])
      }
      return Promise.resolve([])
    })
  })

  it('filters non-operational memories for minimal consent', async () => {
    const resolver = new MemoryResolver()
    const snapshot = await resolver.getSessionSnapshot('user-123', 5, 'minimal')

    expect(snapshot.kernMotivation).toBeNull()
    expect(snapshot.personalityPrefs).toBeNull()
    expect(snapshot.trainingPatterns).toBeNull()
    expect(snapshot.lifeContext).toEqual([])
  })

  it('includes class d memories with full consent and audits the access', async () => {
    const resolver = new MemoryResolver()
    const snapshot = await resolver.getSessionSnapshot('user-123', 5, 'full')

    expect(snapshot.kernMotivation).toBe('Fuer meine Kinder')
    expect(snapshot.trainingPatterns?.knownPainPoints).toContain('Knie')
    expect(mockLogPrivacyAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'class_d_read',
    }))
  })
})
