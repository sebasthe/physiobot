import { redirect } from 'next/navigation'
import TransitionLink from '@/components/navigation/TransitionLink'
import PlanTabs from '@/components/training/PlanTabs'
import { createClient } from '@/lib/supabase/server'
import type { Exercise } from '@/lib/types'

interface ProfileWithPlan {
  active_plan_id: string | null
  training_plans?: {
    id: string
    exercises: Exercise[]
    created_at: string
    source: 'ai' | 'physio'
  } | null
}

export default async function PlanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_plan_id, training_plans!fk_active_plan(id, exercises, created_at, source)')
    .eq('id', user.id)
    .single()

  const typedProfile = profile as ProfileWithPlan | null
  const plan = typedProfile?.training_plans ?? null

  if (!typedProfile?.active_plan_id || !plan) redirect('/dashboard')

  const exercises = (plan.exercises as Exercise[]) ?? []
  const totalMinutes = Math.max(1, Math.round(
    exercises.reduce((sum, exercise) => sum + (exercise.duration_seconds ?? 45), 0) / 60
  ))

  return (
    <main className="vital-gradient min-h-screen pb-12 lg:min-h-full">
      <div className="px-6 pt-12 md:px-8 md:pb-8 lg:px-10 lg:pb-10 xl:px-12 xl:pt-14">
        <TransitionLink href="/dashboard" className="mb-8 inline-flex items-center gap-2 p-0 text-sm font-semibold text-[var(--accent)] transition-colors hover:text-[color:rgba(42,157,138,0.8)]">
          ← Zurück zum Dashboard
        </TransitionLink>
        <div className="mb-12 md:flex md:items-end md:justify-between md:gap-8">
          <div>
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.28em] text-[rgba(42,157,138,0.6)]">Aktiver Plan</span>
            <h1 className="font-display text-6xl uppercase tracking-tight text-white">Übungsdetails</h1>
            <p className="mt-2 text-sm text-white/40">
              {exercises.length} Übungen · ca. {totalMinutes} Minuten · erstellt {new Date(plan.created_at).toLocaleDateString('de-DE')}
            </p>
          </div>
          <div className="mt-5 rounded-2xl border border-white/5 bg-white/5 px-5 py-4 text-xs uppercase tracking-[0.18em] text-white/45 md:mt-0 md:min-w-[16rem] md:text-right">
            {plan.source === 'physio' ? 'Von deinem Physio erstellt' : 'Von PhysioCoach generiert'}
          </div>
        </div>

        <PlanTabs exercises={exercises} />
      </div>
    </main>
  )
}
