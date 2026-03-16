export interface VoiceConfig {
  stt: 'elevenlabs' | 'browser' | 'none'
  tts: 'elevenlabs' | 'browser' | 'kokoro'
  llmEndpoint: string
  autoListen: boolean
  language: string
}

export interface TurnContext {
  systemPrompt: string
  tools?: ToolDefinition[]
  metadata?: Record<string, unknown>
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type StreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'done'; reply: string; llmLatencyMs: number; totalLatencyMs: number }

export interface WorkoutState {
  sessionId: string
  status: 'active' | 'paused' | 'completed'
  exercises: ExerciseState[]
  currentExerciseIndex: number
  startedAt: string
}

export interface ExerciseState {
  id: string
  name: string
  phase: 'warmup' | 'main' | 'cooldown'
  type: 'timed' | 'reps'
  targetDuration?: number
  targetSets?: number
  targetReps?: number
  completedSets: number
  remainingSeconds?: number
  status: 'pending' | 'active' | 'completed' | 'skipped'
}

export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}
