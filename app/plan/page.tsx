import { redirect } from 'next/navigation'
import TransitionLink from '@/components/navigation/TransitionLink'
import PlanTabs from '@/components/training/PlanTabs'
import { localizeExercises } from '@/lib/exercises'
import { toLocaleTag } from '@/lib/i18n/config'
import { formatTemplate } from '@/lib/i18n/format'
import { getMessages } from '@/lib/i18n/messages'
import { getRequestLanguage } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import type { Exercise, StoredExercise } from '@/lib/types'

interface ProfileWithPlan {
  active_plan_id: string | null
  training_plans?: {
    id: string
    exercises: StoredExercise[]
    created_at: string
    source: 'ai' | 'physio'
  } | null
}

export default async function PlanPage() {
  const locale = await getRequestLanguage()
  const messages = getMessages(locale)
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

  const exercises = localizeExercises(plan.exercises, locale)
  const totalMinutes = Math.max(1, Math.round(
    exercises.reduce((sum, exercise) => sum + (exercise.duration_seconds ?? 45), 0) / 60
  ))

  return (
    <main className="vital-gradient min-h-screen pb-12 lg:min-h-full">
      <div className="px-5 pt-6 md:px-8 md:pb-8 md:pt-12 lg:px-10 lg:pb-10 xl:px-12 xl:pt-14">
        <section className="surface-card mb-5 rounded-[1.85rem] p-4 md:mb-10 md:rounded-[2rem] md:p-7">
          <TransitionLink href="/dashboard" className="mb-4 inline-flex items-center gap-2 p-0 text-sm font-semibold text-[var(--accent)] transition-colors hover:text-[color:rgba(42,157,138,0.8)]">
            {messages.common.backToDashboard}
          </TransitionLink>
          <div className="md:flex md:items-end md:justify-between md:gap-8">
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.28em] text-[rgba(42,157,138,0.6)]">{messages.plan.eyebrow}</span>
              <h1 className="font-display text-[clamp(2.45rem,11.5vw,4.9rem)] uppercase leading-[0.94] tracking-tight text-white">
                {messages.plan.title}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40 sm:mt-4 sm:text-[11px]">
                <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 sm:py-2">{formatTemplate(messages.plan.exerciseCount, { count: exercises.length })}</span>
                <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 sm:py-2">{formatTemplate(messages.plan.minutesApprox, { minutes: totalMinutes })}</span>
                <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1.5 sm:py-2">
                  {new Date(plan.created_at).toLocaleDateString(toLocaleTag(locale))}
                </span>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-white/45 md:mt-0 md:min-w-[16rem] md:text-right md:text-xs">
              {plan.source === 'physio' ? messages.plan.generatedByPhysio : messages.plan.generatedByCoach}
            </div>
          </div>
        </section>

        <PlanTabs exercises={exercises} />
      </div>
    </main>
  )
}
