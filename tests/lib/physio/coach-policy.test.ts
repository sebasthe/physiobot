import { describe, expect, it } from 'vitest'
import { buildPhysioPolicyPrompt } from '@/lib/physio/coach-policy'
import type { LoadedPhysioContext } from '@/lib/physio/types'

const mockPhysioContext: LoadedPhysioContext = {
  contraindications: ['Kein Ueberkopf bei Schulterimpingement'],
  painLog: [
    {
      location: 'Schulter rechts',
      intensity: 4,
      type: 'ziehend',
      exerciseId: 'ex1',
      timestamp: '2026-03-10T10:00:00.000Z',
    },
  ],
  mobilityBaseline: { shoulder_flexion: 120 },
  therapistNotes: 'Vorsicht bei Rotationsuebungen',
  exerciseModifications: { 'overhead-press': 'Lateral raise stattdessen' },
}

describe('buildPhysioPolicyPrompt', () => {
  it('includes contraindications as hard boundaries', () => {
    const prompt = buildPhysioPolicyPrompt(mockPhysioContext)
    expect(prompt).toContain('Schulterimpingement')
    expect(prompt).toContain('NIEMALS')
  })

  it('includes therapist notes, pain history, and modifications', () => {
    const prompt = buildPhysioPolicyPrompt(mockPhysioContext)
    expect(prompt).toContain('Rotationsuebungen')
    expect(prompt).toContain('Schulter rechts')
    expect(prompt).toContain('Lateral raise')
  })

  it('includes the never diagnose rule', () => {
    expect(buildPhysioPolicyPrompt(mockPhysioContext)).toContain('kein Arzt')
  })
})
