export type CoachMode = 'performance' | 'guidance' | 'safety' | 'motivation'

export interface ModeContext {
  exercisePhase: 'warmup' | 'main' | 'cooldown'
  exerciseStatus: 'pending' | 'active' | 'completed' | 'skipped'
  lastUtterance: string
}

export interface CoachingMemorySnapshot {
  kernMotivation: string | null
  personalityPrefs: {
    communicationStyle: string
    encouragementType: string
  } | null
  trainingPatterns: {
    knownPainPoints: string[]
    preferredExercises: string[]
    fatigueSignals: string[]
  } | null
  lifeContext: string[]
  sessionCount: number
}

export interface MotivationContext {
  sessionCount: number
  exerciseStatus: ModeContext['exerciseStatus']
  kernMotivation: string | null
}

export interface ExtractedSessionInsights {
  motivation_hints: string[]
  personality_preferences: {
    communicationStyle: string
    encouragementType: string
  }
  training_patterns: {
    knownPainPoints: string[]
    preferredExercises: string[]
    fatigueSignals: string[]
  }
  life_context: string[]
}
