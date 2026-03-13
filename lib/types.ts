export type MotivationStyle = 'goal_oriented' | 'pain_avoidance' | 'mixed'
export type FeedbackStyle = 'direct' | 'gentle' | 'energetic'
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'
export type Language = 'de' | 'en'
export type PrivacyConsent = 'full' | 'minimal' | 'none'

export interface UserPersonality {
  motivation_style: MotivationStyle
  feedback_style: FeedbackStyle
  language: Language
  coach_persona: string
}

export interface HealthProfile {
  complaints: string[]
  goals: string
  fitness_level: FitnessLevel
  session_duration_minutes: number
  sessions_per_week: number
}

export interface Exercise {
  name: string
  description: string
  duration_seconds?: number
  repetitions?: number
  sets?: number
  phase: 'warmup' | 'main' | 'cooldown'
  voice_script: string
}

export interface TrainingPlan {
  id?: string
  exercises: Exercise[]
  source: 'ai' | 'physio'
  contraindications?: string[]
  therapist_notes?: string | null
  exercise_modifications?: Record<string, string>
  mobility_baseline?: Record<string, number>
  plan_type?: 'fitness' | 'physio'
}

export interface UserProfile {
  id: string
  role: 'patient' | 'physio'
  active_plan_id: string | null
  privacy_consent?: PrivacyConsent
  name?: string | null
  address?: string | null
  created_at?: string
}

export interface SessionFeedback {
  exercise_id: string
  difficulty: 'well_tolerated' | 'manageable' | 'too_intense' | 'painful'
  notes?: string
}

export const XP_PER_PHASE = {
  warmup: 10,
  main: 20,
  cooldown: 10,
} as const

export const LEVELS = [
  { level: 1, min: 0, max: 200, title: 'Bewegungsstarter' },
  { level: 2, min: 200, max: 400, title: 'Körperbewusst' },
  { level: 3, min: 400, max: 650, title: 'Ausdauernder' },
  { level: 4, min: 650, max: 1000, title: 'Bewegungstalent' },
  { level: 5, min: 1000, max: 1500, title: 'Körpermeister' },
  { level: 6, min: 1500, max: Infinity, title: 'Physio-Champion' },
] as const

export function getLevelInfo(xp: number) {
  return LEVELS.find(level => xp >= level.min && xp < level.max) ?? LEVELS[LEVELS.length - 1]
}

export interface Streak {
  current: number
  longest: number
  last_session: string | null
  freeze_days: number
}

export interface BadgeKey {
  key: string
  name: string
  emoji: string
  description: string
}

export const ALL_BADGES: BadgeKey[] = [
  { key: 'first_step', emoji: '🔥', name: 'Erster Schritt', description: 'Erste Session abgeschlossen' },
  { key: 'week_hero', emoji: '💪', name: '7-Tage-Held', description: '7 Tage Streak' },
  { key: 'neck_pro', emoji: '🎯', name: 'Nacken-Profi', description: '10× Nacken-Plan' },
  { key: 'body_master', emoji: '🏆', name: 'Körpermeister', description: 'Level 5 erreicht' },
  { key: 'energy_source', emoji: '⚡', name: 'Energiequelle', description: '1000 XP gesamt' },
  { key: 'morning_person', emoji: '🌙', name: 'Morgenmensch', description: '7 Sessions vor 9 Uhr' },
  { key: 'comeback_kid', emoji: '🔄', name: 'Comeback-Kid', description: 'Nach Pause zurückgekehrt' },
  { key: 'month_pro', emoji: '💎', name: 'Monats-Profi', description: '30 Tage Streak' },
]

export interface Schedule {
  days: number[]
  notify_time: string
  timezone: string
}
