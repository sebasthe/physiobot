import { describe, expect, it } from 'vitest'
import { PHYSIO_CONSENT_MESSAGE, requiresPhysioConsent } from '@/lib/physio/consent'

describe('requiresPhysioConsent', () => {
  it('requires consent when contraindications exist', () => {
    expect(requiresPhysioConsent({ contraindications: ['No overhead'] })).toBe(true)
  })

  it('does not require consent for plain plans', () => {
    expect(requiresPhysioConsent({ contraindications: [] })).toBe(false)
    expect(requiresPhysioConsent({})).toBe(false)
  })
})

describe('PHYSIO_CONSENT_MESSAGE', () => {
  it('mentions protected health data', () => {
    expect(PHYSIO_CONSENT_MESSAGE).toContain('Gesundheitsdaten')
  })
})
