export type MotivationStyle = 'goal_oriented' | 'pain_avoidance' | 'mixed'
export type FeedbackStyle = 'direct' | 'gentle' | 'energetic'
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'
export type Language = 'de' | 'en'
export type PrivacyConsent = 'full' | 'minimal' | 'none'
export type ExercisePhase = 'warmup' | 'main' | 'cooldown'

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

export interface StoredExerciseTranslation {
  name: string
  description: string
  voice_script: string
}

export interface StoredExercise {
  id: string
  phase: ExercisePhase
  duration_seconds?: number
  repetitions?: number
  sets?: number
  translations: Partial<Record<Language, StoredExerciseTranslation>>
}

export interface Exercise extends StoredExerciseTranslation {
  id: string
  phase: ExercisePhase
  duration_seconds?: number
  repetitions?: number
  sets?: number
}

export interface TrainingPlan {
  id?: string
  exercises: StoredExercise[]
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
  { level: 1, min: 0, max: 200, titleKey: 'movementStarter' },
  { level: 2, min: 200, max: 400, titleKey: 'bodyAware' },
  { level: 3, min: 400, max: 650, titleKey: 'persistent' },
  { level: 4, min: 650, max: 1000, titleKey: 'movementTalent' },
  { level: 5, min: 1000, max: 1500, titleKey: 'bodyMaster' },
  { level: 6, min: 1500, max: Infinity, titleKey: 'physioChampion' },
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

export type BadgeKeyName =
  | 'first_step'
  | 'week_hero'
  | 'neck_pro'
  | 'body_master'
  | 'energy_source'
  | 'morning_person'
  | 'comeback_kid'
  | 'month_pro'

export interface BadgeKey {
  key: BadgeKeyName
  emoji: string
}

export const ALL_BADGES: BadgeKey[] = [
  { key: 'first_step', emoji: '🔥' },
  { key: 'week_hero', emoji: '💪' },
  { key: 'neck_pro', emoji: '🎯' },
  { key: 'body_master', emoji: '🏆' },
  { key: 'energy_source', emoji: '⚡' },
  { key: 'morning_person', emoji: '🌙' },
  { key: 'comeback_kid', emoji: '🔄' },
  { key: 'month_pro', emoji: '💎' },
]

export interface Schedule {
  days: number[]
  notify_time: string
  timezone: string
}
