import { describe, expect, it } from 'vitest'
import {
  DataClass,
  RETENTION_DAYS,
  isValidDataClass,
  isValidConsentLevel,
  resolveConsentLevel,
} from '@/lib/privacy/types'

describe('DataClass', () => {
  it('has four classes', () => {
    expect(DataClass.Operational).toBe('A')
    expect(DataClass.PersonalCoaching).toBe('B')
    expect(DataClass.SensitiveWellness).toBe('C')
    expect(DataClass.MedicalRehab).toBe('D')
  })
})

describe('RETENTION_DAYS', () => {
  it('retains operational data for 90 days', () => {
    expect(RETENTION_DAYS[DataClass.Operational]).toBe(90)
  })

  it('keeps user-owned classes until explicit deletion', () => {
    expect(RETENTION_DAYS[DataClass.PersonalCoaching]).toBeNull()
    expect(RETENTION_DAYS[DataClass.SensitiveWellness]).toBeNull()
    expect(RETENTION_DAYS[DataClass.MedicalRehab]).toBeNull()
  })
})

describe('validators', () => {
  it('accepts valid data classes', () => {
    expect(isValidDataClass('A')).toBe(true)
    expect(isValidDataClass('D')).toBe(true)
  })

  it('rejects invalid data classes', () => {
    expect(isValidDataClass('X')).toBe(false)
    expect(isValidDataClass('')).toBe(false)
  })

  it('validates and resolves consent levels', () => {
    expect(isValidConsentLevel('full')).toBe(true)
    expect(isValidConsentLevel('weird')).toBe(false)
    expect(resolveConsentLevel('minimal')).toBe('minimal')
    expect(resolveConsentLevel('weird')).toBe('full')
  })
})
