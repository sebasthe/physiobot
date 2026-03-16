import type { TurnContext } from '@/lib/voice-module/core/types'

export interface PainEntry {
  location: string
  intensity: number
  type: string
  exerciseId: string
  timestamp: string
}

export interface PhysioContext extends TurnContext {
  contraindications: string[]
  painLog: PainEntry[]
  mobilityBaseline: Record<string, number>
  therapistNotes: string | null
  exerciseModifications: Record<string, string>
}

export type LoadedPhysioContext = Omit<PhysioContext, 'systemPrompt' | 'tools' | 'metadata'>
