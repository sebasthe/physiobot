import { describe, expect, it } from 'vitest'
import { getModelForMode, selectCoachMode } from '@/lib/coach/mode-selector'
import type { ModeContext } from '@/lib/coach/types'

describe('selectCoachMode', () => {
  it('returns performance during active exercise', () => {
    const context: ModeContext = {
      exercisePhase: 'main',
      exerciseStatus: 'active',
      lastUtterance: 'Weiter',
    }

    expect(selectCoachMode(context)).toBe('performance')
  })

  it('returns guidance during rest', () => {
    const context: ModeContext = {
      exercisePhase: 'main',
      exerciseStatus: 'completed',
      lastUtterance: 'Was mache ich jetzt?',
    }

    expect(selectCoachMode(context)).toBe('guidance')
  })

  it('returns safety when pain is mentioned', () => {
    const context: ModeContext = {
      exercisePhase: 'main',
      exerciseStatus: 'active',
      lastUtterance: 'Das tut weh',
    }

    expect(selectCoachMode(context)).toBe('safety')
  })

  it('returns safety when the user says it is too hard', () => {
    const context: ModeContext = {
      exercisePhase: 'main',
      exerciseStatus: 'active',
      lastUtterance: 'Das ist zu schwer fuer mich',
    }

    expect(selectCoachMode(context)).toBe('safety')
  })

  it('returns guidance during cooldown', () => {
    const context: ModeContext = {
      exercisePhase: 'cooldown',
      exerciseStatus: 'active',
      lastUtterance: 'Ok',
    }

    expect(selectCoachMode(context)).toBe('guidance')
  })
})

describe('getModelForMode', () => {
  it('returns haiku for performance', () => {
    expect(getModelForMode('performance')).toBe('claude-haiku-4-5-20251001')
  })

  it('returns haiku for guidance', () => {
    expect(getModelForMode('guidance')).toBe('claude-haiku-4-5-20251001')
  })

  it('returns sonnet for safety', () => {
    expect(getModelForMode('safety')).toContain('sonnet')
  })

  it('returns sonnet for motivation', () => {
    expect(getModelForMode('motivation')).toContain('sonnet')
  })
})
