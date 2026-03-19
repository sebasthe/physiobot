import type { SupabaseClient } from '@supabase/supabase-js'
import { getLevelInfo, XP_PER_PHASE, type Exercise } from '@/lib/types'

export function calculateSessionXP(exercises: Exercise[], streakActive: boolean): number {
  const base = exercises.reduce((sum, exercise) => sum + (XP_PER_PHASE[exercise.phase] ?? 10), 0)
  const streakBonus = streakActive ? Math.round(base * 0.2) : 0
  return base + streakBonus + 20
}

export interface GamificationResult {
  xpEarned: number
  newXP: number
  newLevel: number
  levelTitleKey: string
  newStreak: number
  longestStreak: number
  newBadges: string[]
}

export async function updateGamification(
  supabase: SupabaseClient,
  userId: string,
  exercises: Exercise[],
  sessionId?: string
): Promise<GamificationResult> {
  const [{ data: profile }, { data: streak }] = await Promise.all([
    supabase.from('profiles').select('xp, level').eq('id', userId).maybeSingle(),
    supabase.from('streaks').select('*').eq('user_id', userId).maybeSingle(),
  ])

  const currentXP = profile?.xp ?? 0
  const currentStreak = streak?.current ?? 0
  const longest = streak?.longest ?? 0
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const lastDate = streak?.last_session ?? null

  let newStreak = 1
  if (lastDate === today) newStreak = currentStreak
  else if (lastDate === yesterday) newStreak = currentStreak + 1

  const streakActive = lastDate === yesterday || lastDate === today
  const newLongest = Math.max(longest, newStreak)
  const xpEarned = calculateSessionXP(exercises, streakActive)
  const newXP = currentXP + xpEarned
  const levelInfo = getLevelInfo(newXP)

  await Promise.all([
    supabase.from('profiles').update({ xp: newXP, level: levelInfo.level }).eq('id', userId),
    supabase.from('streaks').upsert({
      user_id: userId,
      current: newStreak,
      longest: newLongest,
      last_session: today,
    }),
    supabase.from('xp_events').insert({
      user_id: userId,
      amount: xpEarned,
      reason: 'session_complete',
      session_id: sessionId ?? null,
    }),
  ])

  const newBadges = await checkAndAwardBadges(supabase, userId, {
    xp: newXP,
    level: levelInfo.level,
    streak: newStreak,
  })

  return {
    xpEarned,
    newXP,
    newLevel: levelInfo.level,
    levelTitleKey: levelInfo.titleKey,
    newStreak,
    longestStreak: newLongest,
    newBadges,
  }
}

async function checkAndAwardBadges(
  supabase: SupabaseClient,
  userId: string,
  stats: { xp: number; level: number; streak: number }
): Promise<string[]> {
  const { data: existing } = await supabase
    .from('badges_earned')
    .select('badge_key')
    .eq('user_id', userId)
  const earned = new Set((existing ?? []).map(item => item.badge_key))

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', userId)

  const candidates: string[] = []
  if ((sessions?.length ?? 0) >= 1 && !earned.has('first_step')) candidates.push('first_step')
  if (stats.streak >= 7 && !earned.has('week_hero')) candidates.push('week_hero')
  if (stats.streak >= 30 && !earned.has('month_pro')) candidates.push('month_pro')
  if (stats.xp >= 1000 && !earned.has('energy_source')) candidates.push('energy_source')
  if (stats.level >= 5 && !earned.has('body_master')) candidates.push('body_master')

  if (candidates.length > 0) {
    await supabase
      .from('badges_earned')
      .insert(candidates.map(badge_key => ({ user_id: userId, badge_key })))
  }

  return candidates
}
