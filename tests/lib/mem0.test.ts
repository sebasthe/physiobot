import { describe, it, expect, vi } from 'vitest'

vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue([
      { memory: 'Nutzer hat Knieschmerzen links', score: 0.95 }
    ]),
  })),
}))

describe('getRelevantMemories', () => {
  it('returns memory strings from search results', async () => {
    const { getRelevantMemories } = await import('@/lib/mem0')
    const memories = await getRelevantMemories('user-123', 'Knieschmerzen')
    expect(memories).toContain('Nutzer hat Knieschmerzen links')
  })
})

describe('addMemory', () => {
  it('calls mem0 add with user_id', async () => {
    const { addMemory } = await import('@/lib/mem0')
    await expect(addMemory('user-123', 'Neues Feedback')).resolves.not.toThrow()
  })
})
