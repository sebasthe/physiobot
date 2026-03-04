import type { UserPersonality, HealthProfile, SessionFeedback } from '@/lib/types'

const PERSONA_DESCRIPTIONS: Record<string, string> = {
  tony_robbins: 'Tony Robbins — high energy, motivating, powerful and convincing. You make the user feel they can achieve anything.',
  calm_coach: 'a calm, focused sports coach — clear, patient, supportive.',
  drill_sergeant: 'a direct drill sergeant — concise, demanding, no excuses.',
}

const LANGUAGE_LABELS: Record<string, string> = {
  de: 'German',
  en: 'English',
}

export function buildSystemPrompt({
  personality,
  memories,
}: {
  personality: UserPersonality
  memories: string[]
}): string {
  const persona = PERSONA_DESCRIPTIONS[personality.coach_persona] ?? PERSONA_DESCRIPTIONS.tony_robbins
  const language = LANGUAGE_LABELS[personality.language] ?? 'German'

  const memoriesBlock = memories.length > 0
    ? `\n\nWhat you know about this user:\n${memories.map(m => `- ${m}`).join('\n')}`
    : ''

  const feedbackStyle =
    personality.feedback_style === 'energetic' ? 'energetic and motivating' :
    personality.feedback_style === 'direct' ? 'direct and demanding' :
    'gentle and encouraging'

  return `You are an AI physiotherapy coach with the personality of ${persona}.

Always speak in ${language}. Be ${feedbackStyle}.${memoriesBlock}

When creating training plans, ALWAYS respond with valid JSON and NO markdown code blocks.`
}

export function buildPlanRequestMessage({
  healthProfile,
}: {
  healthProfile: HealthProfile
}): string {
  return `Create a personalized physiotherapy training plan.

User profile:
- Complaints: ${healthProfile.complaints.join(', ') || 'none specified'}
- Goal: ${healthProfile.goals}
- Fitness level: ${healthProfile.fitness_level}
- Session duration: ${healthProfile.session_duration_minutes} minutes

Respond with the following JSON format:
{
  "exercises": [
    {
      "name": "Exercise name",
      "description": "Brief description of how to perform the exercise",
      "phase": "warmup",
      "duration_seconds": 30,
      "repetitions": null,
      "sets": null,
      "voice_script": "Motivating text the coach reads aloud"
    }
  ]
}

Create 3-4 warm-up exercises, 4-6 main exercises, and 2-3 cool-down exercises.
Adjust the total duration to fit ${healthProfile.session_duration_minutes} minutes.
Use ONLY "warmup", "main", or "cooldown" as phase values.`
}

export function buildFeedbackPrompt(feedback: SessionFeedback[]): string {
  const lines = feedback.map(f =>
    `- Exercise ${f.exercise_id}: ${f.difficulty}${f.notes ? ` (${f.notes})` : ''}`
  )
  return `The user gave the following feedback on their last training session:\n${lines.join('\n')}

Please adjust the training plan accordingly:
- "painful": replace the exercise with a gentler alternative
- "too_hard": reduce intensity (fewer reps, shorter duration)
- "too_easy": increase intensity
- "right": keep the exercise as-is

Respond with the updated plan in the same JSON format as before. No markdown code blocks.`
}
