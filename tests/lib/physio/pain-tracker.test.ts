import { describe, expect, it } from 'vitest'
import { parsePainReport, shouldAbortSession } from '@/lib/physio/pain-tracker'
import type { PainEntry } from '@/lib/physio/types'

describe('parsePainReport', () => {
  it('creates a structured pain entry', () => {
    const report = parsePainReport({ location: 'Knie rechts', intensity: 6, type: 'stechend' }, 'ex1')

    expect(report.location).toBe('Knie rechts')
    expect(report.intensity).toBe(6)
    expect(report.type).toBe('stechend')
    expect(report.exerciseId).toBe('ex1')
    expect(report.timestamp).toBeDefined()
  })

  it('clamps intensity into the valid range', () => {
    expect(parsePainReport({ location: 'Knie', intensity: 15, type: 'dumpf' }, 'ex1').intensity).toBe(10)
    expect(parsePainReport({ location: 'Knie', intensity: -2, type: 'dumpf' }, 'ex1').intensity).toBe(1)
  })
})

describe('shouldAbortSession', () => {
  it('aborts at eight or above', () => {
    const severePain: PainEntry = {
      location: 'Ruecken',
      intensity: 8,
      type: 'stechend',
      exerciseId: 'ex1',
      timestamp: new Date().toISOString(),
    }

    expect(shouldAbortSession(severePain)).toBe(true)
  })

  it('continues below the threshold', () => {
    const mildPain: PainEntry = {
      location: 'Ruecken',
      intensity: 5,
      type: 'ziehend',
      exerciseId: 'ex1',
      timestamp: new Date().toISOString(),
    }

    expect(shouldAbortSession(mildPain)).toBe(false)
  })
})
