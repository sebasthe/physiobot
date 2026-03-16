import { createClient } from '@/lib/supabase/server'
import type { LoadedPhysioContext, PainEntry } from './types'

interface TrainingPlanRow {
  contraindications?: string[] | null
  therapist_notes?: string | null
  exercise_modifications?: Record<string, string> | null
  mobility_baseline?: Record<string, number> | null
}

interface PainLogRow {
  location: string
  intensity: number
  type: string
  exercise_id: string
  created_at: string
}

export async function loadPhysioContext(userId: string, planId: string): Promise<LoadedPhysioContext> {
  const supabase = await createClient()

  const [{ data: plan }, { data: painEntries }] = await Promise.all([
    supabase
      .from('training_plans')
      .select('contraindications, therapist_notes, exercise_modifications, mobility_baseline')
      .eq('id', planId)
      .maybeSingle(),
    supabase
      .from('pain_log')
      .select('location, intensity, type, exercise_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const typedPlan = (plan ?? null) as TrainingPlanRow | null
  const typedPainEntries = (painEntries ?? []) as PainLogRow[]
  const painLog: PainEntry[] = typedPainEntries.map(entry => ({
    location: entry.location,
    intensity: entry.intensity,
    type: entry.type,
    exerciseId: entry.exercise_id,
    timestamp: entry.created_at,
  }))

  return {
    contraindications: typedPlan?.contraindications ?? [],
    painLog,
    mobilityBaseline: typedPlan?.mobility_baseline ?? {},
    therapistNotes: typedPlan?.therapist_notes ?? null,
    exerciseModifications: typedPlan?.exercise_modifications ?? {},
  }
}

export function hasPhysioContext(context: LoadedPhysioContext): boolean {
  return context.contraindications.length > 0
    || context.painLog.length > 0
    || Object.keys(context.mobilityBaseline).length > 0
    || Boolean(context.therapistNotes)
    || Object.keys(context.exerciseModifications).length > 0
}
