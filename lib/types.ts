export type MotivationStyle = 'goal_oriented' | 'pain_avoidance' | 'mixed'
export type FeedbackStyle = 'direct' | 'gentle' | 'energetic'
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'
export type Language = 'de' | 'en'

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
}

export interface SessionFeedback {
  exercise_id: string
  difficulty: 'too_easy' | 'right' | 'too_hard' | 'painful'
  notes?: string
}
