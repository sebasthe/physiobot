import { describe, expect, it, vi } from 'vitest'
import { classifyUtterance } from '@/lib/coach/utterance-classifier'

const createMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: '{"category":"question","confidence":0.8}' }],
}))

vi.mock('@/lib/claude/client', () => ({
  anthropic: {
    messages: {
      create: createMock,
    },
  },
}))

describe('Performance budgets', () => {
  it('fast-path command classification completes in under 5ms', async () => {
    const start = performance.now()
    await classifyUtterance('Pause')
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5)
  })

  it('fast-path filler detection completes in under 5ms', async () => {
    const start = performance.now()
    await classifyUtterance('Ähm')
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5)
  })
})
