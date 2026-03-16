import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSearch } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
}))

vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({
    search: mockSearch,
  })),
}))

import { MemoryResolver } from '@/lib/memory/resolver'

describe('MemoryResolver', () => {
  let resolver: MemoryResolver

  beforeEach(() => {
    resolver = new MemoryResolver()
    resolver.clearCache()
    mockSearch.mockReset()
    mockSearch.mockImplementation((query: string) => {
      if (query.includes('Motivation')) {
        return Promise.resolve([{ memory: 'Kern-Motivation: Fuer meine Kinder da sein' }])
      }
      if (query.includes('Persoenlichkeit')) {
        return Promise.resolve([{ memory: 'Kommunikationsstil: direkt, mag Herausforderungen' }])
      }
      if (query.includes('Trainingsmuster')) {
        return Promise.resolve([{ memory: 'Schulter-Probleme bei Squat und atmet schwer' }])
      }
      if (query.includes('Lebenskontext')) {
        return Promise.resolve([{ memory: 'Buerojob, 2 Kinder' }])
      }
      return Promise.resolve([])
    })
  })

  it('assembles a coaching memory snapshot', async () => {
    const snapshot = await resolver.getSessionSnapshot('user-123', 5)

    expect(snapshot.sessionCount).toBe(5)
    expect(snapshot.kernMotivation).toBe('Fuer meine Kinder da sein')
    expect(snapshot.personalityPrefs?.communicationStyle).toBe('direkt')
    expect(snapshot.trainingPatterns?.knownPainPoints).toContain('Schulter')
    expect(snapshot.lifeContext).toContain('Buerojob, 2 Kinder')
  })

  it('returns null-like fields when memories are empty', async () => {
    mockSearch.mockResolvedValue([])

    const snapshot = await resolver.getSessionSnapshot('user-empty', 1)

    expect(snapshot.sessionCount).toBe(1)
    expect(snapshot.kernMotivation).toBeNull()
    expect(snapshot.personalityPrefs).toBeNull()
    expect(snapshot.trainingPatterns).toBeNull()
    expect(snapshot.lifeContext).toEqual([])
  })

  it('caches snapshots for the same user and session', async () => {
    const first = await resolver.getSessionSnapshot('user-123', 5)
    const second = await resolver.getSessionSnapshot('user-123', 5)

    expect(first).toBe(second)
  })

  it('returns different snapshots for different users', async () => {
    const first = await resolver.getSessionSnapshot('user-123', 5)
    const second = await resolver.getSessionSnapshot('user-456', 3)

    expect(first).not.toBe(second)
  })
})
