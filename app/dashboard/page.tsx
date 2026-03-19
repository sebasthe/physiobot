import { redirect } from 'next/navigation'
import { localizeExercises } from '@/lib/exercises'
import { formatTemplate } from '@/lib/i18n/format'
import { getMessages } from '@/lib/i18n/messages'
import { getRequestLanguage } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'
import type { Exercise, Language, MotivationStyle, Schedule, Streak } from '@/lib/types'

interface ActivePlanData {
  id: string
  exercises: Exercise[]
  created_at: string
  source: 'ai' | 'physio'
}

function getCurrentWeekRange() {
  const now = new Date()
  const mondayOffset = (now.getDay() + 6) % 7
  const start = new Date(now)
  start.setDate(now.getDate() - mondayOffset)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

function compactGoalText(goal: string | null | undefined, fallbackGoal: string) {
  if (!goal) return fallbackGoal
  const firstSentence = goal.split(/[.!?]/)[0]?.trim() ?? ''
  if (!firstSentence) return fallbackGoal
  return firstSentence.length > 110 ? `${firstSentence.slice(0, 107)}...` : firstSentence
}

function buildPlanSummary(goal: string | null | undefined, motivationStyle: MotivationStyle | null | undefined, language: Language) {
  const messages = getMessages(language)
  const compactGoal = compactGoalText(goal, messages.dashboard.planSummary.fallbackGoal)
  if (motivationStyle === 'goal_oriented') {
    return formatTemplate(messages.dashboard.planSummary.goalOriented, { goal: compactGoal })
  }
  if (motivationStyle === 'pain_avoidance') {
    return formatTemplate(messages.dashboard.planSummary.painAvoidance, { goal: compactGoal })
  }
  return formatTemplate(messages.dashboard.planSummary.mixed, { goal: compactGoal })
}

function buildMotivationSlogan(goal: string | null | undefined, motivationStyle: MotivationStyle | null | undefined, language: Language) {
  const messages = getMessages(language)
  const compactGoal = compactGoalText(goal, messages.dashboard.planSummary.fallbackGoal)
  if (motivationStyle === 'goal_oriented') {
    return formatTemplate(messages.dashboard.motivation.goalOriented, { goal: compactGoal })
  }
  if (motivationStyle === 'pain_avoidance') {
    return formatTemplate(messages.dashboard.motivation.painAvoidance, { goal: compactGoal.toLowerCase() })
  }
  return formatTemplate(messages.dashboard.motivation.mixed, { goal: compactGoal.toLowerCase() })
}

export default async function DashboardPage() {
  const locale = await getRequestLanguage()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { start, end } = getCurrentWeekRange()

  const [
    { data: healthProfile },
    { data: profile },
    { data: streak },
    { data: badges },
    { data: schedule },
    { data: completedSessions },
    { data: personality },
  ] = await Promise.all([
    supabase
      .from('health_profiles')
      .select('id, goals')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('profiles')
      .select('active_plan_id, xp, level, name')
      .eq('id', user.id)
      .single(),
    supabase.from('streaks').select('current, longest, last_session, freeze_days').eq('user_id', user.id).maybeSingle(),
    supabase.from('badges_earned').select('badge_key').eq('user_id', user.id),
    supabase.from('schedules').select('days, notify_time, timezone').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('sessions')
      .select('completed_at')
      .eq('user_id', user.id)
      .not('completed_at', 'is', null)
      .gte('completed_at', start.toISOString())
      .lt('completed_at', end.toISOString()),
    supabase.from('user_personality').select('motivation_style').eq('user_id', user.id).maybeSingle(),
  ])

  if (!healthProfile) redirect('/onboarding/personality')

  let activePlan: ActivePlanData | null = null
  if (profile?.active_plan_id) {
    const { data: plan } = await supabase
      .from('training_plans')
      .select('id, exercises, created_at, source')
      .eq('id', profile.active_plan_id)
      .single()
    if (plan) {
      activePlan = {
        id: plan.id,
        exercises: localizeExercises(plan.exercises, locale),
        created_at: plan.created_at,
        source: plan.source as 'ai' | 'physio',
      }
    }
  }

  const completedWeekDays = Array.from(
    new Set(
      (completedSessions ?? [])
        .map(session => session.completed_at ? new Date(session.completed_at).getDay() : null)
        .filter((day): day is number => day !== null)
    )
  )

  const motivationStyle = (personality?.motivation_style as MotivationStyle | null | undefined) ?? null
  const planSummary = buildPlanSummary(healthProfile.goals, motivationStyle, locale)
  const motivationSlogan = buildMotivationSlogan(healthProfile.goals, motivationStyle, locale)

  return (
    <DashboardClient
      hasActivePlan={!!activePlan}
      initialPlan={activePlan}
      profile={{
        name: profile?.name ?? null,
        xp: profile?.xp ?? 0,
        level: profile?.level ?? 1,
      }}
      streak={(streak as Streak | null) ?? null}
      earnedBadgeKeys={(badges ?? []).map(badge => badge.badge_key)}
      schedule={(schedule as Schedule | null) ?? null}
      completedWeekDays={completedWeekDays}
      planSummary={planSummary}
      motivationSlogan={motivationSlogan}
    />
  )
}
