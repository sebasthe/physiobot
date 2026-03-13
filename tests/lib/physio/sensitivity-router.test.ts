import { describe, expect, it } from 'vitest'
import { classifySensitivity } from '@/lib/physio/sensitivity-router'

describe('classifySensitivity', () => {
  it('returns normal for regular exercise talk', () => {
    expect(classifySensitivity('Naechste Uebung bitte').level).toBe('normal')
  })

  it('returns elevated for general pain mention', () => {
    expect(classifySensitivity('Das tut ein bisschen weh').level).toBe('elevated')
  })

  it('returns high for specific pain with duration', () => {
    const result = classifySensitivity('Stechender Schmerz im rechten Knie seit 2 Wochen')
    expect(result.level).toBe('high')
    expect(result.signals).toContain('specific_pain')
  })

  it('returns high for diagnosis mention', () => {
    expect(classifySensitivity('Mein Arzt hat Bandscheibenvorfall diagnostiziert').level).toBe('high')
  })

  it('returns elevated for medication mention', () => {
    expect(classifySensitivity('Ich nehme Ibuprofen gegen die Schmerzen').level).toBe('elevated')
  })
})
