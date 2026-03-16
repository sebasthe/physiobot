import { describe, expect, it, vi } from 'vitest'
import { loadPhysioContext } from '@/lib/physio/context-loader'

const mockPlanMaybeSingle = vi.fn().mockResolvedValue({
  data: {
    contraindications: ['Kein Ueberkopf bei Schulterimpingement'],
    therapist_notes: 'Vorsicht bei Rotationsuebungen',
    exercise_modifications: { 'overhead-press': 'Lateral raise stattdessen' },
    mobility_baseline: { shoulder_flexion: 120, knee_extension: 170 },
  },
})

const mockPainLimit = vi.fn().mockResolvedValue({
  data: [
    {
      location: 'Knie rechts',
      intensity: 4,
      type: 'ziehend',
      exercise_id: 'ex1',
      created_at: '2026-03-10T10:00:00.000Z',
    },
  ],
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === 'training_plans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockPlanMaybeSingle,
            }),
          }),
        }
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: mockPainLimit,
            }),
          }),
        }),
      }
    }),
  }),
}))

describe('loadPhysioContext', () => {
  it('loads contraindications, notes, pain log, and modifications', async () => {
    const context = await loadPhysioContext('user-123', 'plan-456')

    expect(context.contraindications).toContain('Kein Ueberkopf bei Schulterimpingement')
    expect(context.therapistNotes).toContain('Rotationsuebungen')
    expect(context.painLog).toHaveLength(1)
    expect(context.painLog[0].location).toBe('Knie rechts')
    expect(context.exerciseModifications['overhead-press']).toContain('Lateral raise')
  })
})
