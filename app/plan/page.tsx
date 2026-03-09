import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Exercise } from '@/lib/types'

const PHASES = [
  { key: 'warmup', label: 'Aufwärmen', emoji: '🔥' },
  { key: 'main', label: 'Hauptteil', emoji: '⚡' },
  { key: 'cooldown', label: 'Cooldown', emoji: '🌿' },
] as const

export default async function PlanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_plan_id')
    .eq('id', user.id)
    .single()

  if (!profile?.active_plan_id) redirect('/dashboard')

  const { data: plan } = await supabase
    .from('training_plans')
    .select('id, exercises, created_at, source')
    .eq('id', profile.active_plan_id)
    .single()

  if (!plan) redirect('/dashboard')

  const exercises = (plan.exercises as Exercise[]) ?? []
  const totalMinutes = Math.max(1, Math.round(
    exercises.reduce((sum, exercise) => sum + (exercise.duration_seconds ?? 45), 0) / 60
  ))

  return (
    <main className="mx-auto min-h-screen max-w-[430px] px-5 pb-10 pt-8">
      <div className="mb-6">
        <Link href="/dashboard" className="mb-4 inline-flex text-sm font-semibold text-[var(--teal)]">
          ← Zurück zum Dashboard
        </Link>
        <div className="text-phase mb-2 text-[var(--teal)]">Aktiver Plan</div>
        <h1 className="font-display text-5xl leading-none text-[var(--foreground)]">Übungsdetails</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          {exercises.length} Übungen · ca. {totalMinutes} Minuten · erstellt {new Date(plan.created_at).toLocaleDateString('de-DE')}
        </p>
      </div>

      <div className="space-y-5">
        {PHASES.map(phase => {
          const phaseExercises = exercises.filter(exercise => exercise.phase === phase.key)
          if (phaseExercises.length === 0) return null
          return (
            <section key={phase.key} className="rounded-[20px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{phase.emoji}</span>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{phase.label}</h2>
                </div>
                <span className="text-xs text-[var(--text-muted)]">{phaseExercises.length} Übungen</span>
              </div>
              <ul className="space-y-3">
                {phaseExercises.map((exercise, index) => (
                  <li key={`${phase.key}-${index}`} className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{exercise.name}</h3>
                      <span className="rounded-full bg-[var(--teal-light)] px-2 py-0.5 text-xs font-bold text-[var(--teal)]">
                        {exercise.duration_seconds ? `${exercise.duration_seconds}s` : `${exercise.sets ?? 1}×${exercise.repetitions ?? 8}`}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{exercise.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </main>
  )
}
