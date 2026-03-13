import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyUtterance } from '@/lib/coach/utterance-classifier'

const createMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: '{"category":"command","confidence":0.95}' }],
}))

vi.mock('@/lib/claude/client', () => ({
  anthropic: {
    messages: {
      create: createMock,
    },
  },
}))

describe('classifyUtterance', () => {
  beforeEach(() => {
    createMock.mockClear()
  })

  it('classifies "Nächste Übung" as command', async () => {
    const result = await classifyUtterance('Nächste Übung')
    expect(result.category).toBe('command')
    expect(result.confidence).toBeGreaterThan(0.8)
    expect(result.commandName).toBe('next_exercise')
  })

  it('classifies "Ähm" as filler via fast path', async () => {
    const result = await classifyUtterance('Ähm')
    expect(result.category).toBe('filler')
    expect(result.fastPath).toBe(true)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('classifies "Ok" as acknowledgment via fast path', async () => {
    const result = await classifyUtterance('Ok')
    expect(result.category).toBe('acknowledgment')
    expect(result.fastPath).toBe(true)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('classifies "Ja" as acknowledgment', async () => {
    const result = await classifyUtterance('Ja')
    expect(result.category).toBe('acknowledgment')
  })

  it('returns category and confidence for ambiguous utterances', async () => {
    const originalWindow = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
    })
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"category":"question","confidence":0.81}' }],
    })

    const result = await classifyUtterance('Was mache ich als nächstes?')

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })

    expect(result).toHaveProperty('category', 'question')
    expect(result).toHaveProperty('confidence', 0.81)
    expect(result.fastPath).toBe(false)
  })

  it('falls back to question when the LLM response is invalid', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json' }],
    })

    const result = await classifyUtterance('Irgendwas unklar')

    expect(result).toEqual({
      category: 'question',
      confidence: 0.3,
      fastPath: false,
    })
  })
})

describe('fast path classification', () => {
  beforeEach(() => {
    createMock.mockClear()
  })

  it('matches known command patterns without LLM', async () => {
    const commands = ['Pause', 'Weiter', 'Stop', 'Nächste', 'Zurück']

    for (const command of commands) {
      const result = await classifyUtterance(command)
      expect(result.category).toBe('command')
      expect(result.fastPath).toBe(true)
    }

    expect(createMock).not.toHaveBeenCalled()
  })

  it('matches filler patterns without LLM', async () => {
    const fillers = ['Ähm', 'Äh', 'Hmm', 'Mhm']

    for (const filler of fillers) {
      const result = await classifyUtterance(filler)
      expect(result.category).toBe('filler')
      expect(result.fastPath).toBe(true)
    }

    expect(createMock).not.toHaveBeenCalled()
  })
})
