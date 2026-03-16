import { describe, expect, it } from 'vitest'
import { shouldRequestRepeat } from '@/lib/voice-module/core/stt-utils'

describe('shouldRequestRepeat', () => {
  it('returns false for normal length text', () => {
    expect(shouldRequestRepeat('Nächste Übung bitte')).toBe(false)
  })

  it('returns true for very short garbled text', () => {
    expect(shouldRequestRepeat('x')).toBe(true)
  })

  it('returns true for text that is just noise characters', () => {
    expect(shouldRequestRepeat('...')).toBe(true)
  })

  it('returns false for short but valid text', () => {
    expect(shouldRequestRepeat('Ja')).toBe(false)
  })
})
