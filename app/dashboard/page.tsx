import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'
import type { Exercise, Schedule, Streak } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Check health profile exists
  const { data: healthProfile } = await supabase
    .from('health_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!healthProfile) redirect('/onboarding/personality')

  // Get profile with active plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_plan_id, xp, level, name')
    .eq('id', user.id)
    .single()

  const [{ data: streak }, { data: badges }, { data: schedule }] = await Promise.all([
    supabase.from('streaks').select('current, longest, last_session, freeze_days').eq('user_id', user.id).maybeSingle(),
    supabase.from('badges_earned').select('badge_key').eq('user_id', user.id),
    supabase.from('schedules').select('days, notify_time, timezone').eq('user_id', user.id).maybeSingle(),
  ])

  let exercises: Exercise[] = []
  if (profile?.active_plan_id) {
    const { data: plan } = await supabase
      .from('training_plans')
      .select('exercises')
      .eq('id', profile.active_plan_id)
      .single()
    exercises = (plan?.exercises as Exercise[]) ?? []
  }

  return (
    <DashboardClient
      hasActivePlan={!!profile?.active_plan_id}
      initialExercises={exercises}
      profile={{
        name: profile?.name ?? null,
        xp: profile?.xp ?? 0,
        level: profile?.level ?? 1,
      }}
      streak={(streak as Streak | null) ?? null}
      earnedBadgeKeys={(badges ?? []).map(badge => badge.badge_key)}
      schedule={(schedule as Schedule | null) ?? null}
    />
  )
}
