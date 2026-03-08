import type { UserPersonality, HealthProfile, SessionFeedback } from '@/lib/types'
import type { SessionMemoryContext } from '@/lib/mem0'

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
      "voice_script": "Motivating text the coach reads. He shall provide the exercice description in regular voice and then speak louder with some personalized motivation to encourage the user to do the exercise."
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

export function buildDrMiaSystemPrompt(params: {
  userName: string
  streak: number
  bodyAreas: string[]
  memoryContext: SessionMemoryContext
  timeOfDay: 'morning' | 'midday' | 'evening'
  lastSession?: { date: string; duration: number; completedAll: boolean }
  sessionNumber: number
}): string {
  const { userName, streak, bodyAreas, memoryContext, timeOfDay, lastSession, sessionNumber } = params

  const timeLabel = timeOfDay === 'morning'
    ? 'Morgen (vor 11 Uhr)'
    : timeOfDay === 'midday'
      ? 'Mittag (11–17 Uhr)'
      : 'Abend'

  const lastSessionText = lastSession
    ? `Letzte Session: ${lastSession.date}, ${lastSession.duration}s, ${lastSession.completedAll ? 'vollständig abgeschlossen' : 'nicht vollständig abgeschlossen'}.`
    : 'Heute ist die erste Session.'

  const fiveWhysInstruction = sessionNumber <= 3
    ? `
FIVE WHYS (Session ${sessionNumber}/3): Frag empathisch nach der tieferen Motivation.
Session 1: Was hat dich heute hergebracht? Was stört dich im Alltag am meisten?
Session 2: Was würde sich verändern, wenn das besser wird?
Session 3: Was ist dir daran emotional wirklich wichtig?
Wenn der Kern gefunden ist, hör auf.`
    : ''

  const motivationLine = memoryContext.kernMotivation
    ? `Kern-Motivation: "${memoryContext.kernMotivation}" — regelmäßig organisch aufgreifen.`
    : 'Kern-Motivation: noch nicht bekannt.'

  return `Du bist Dr. Mia, persönlicher Physiotherapie-Coach in der PhysioCoach App.

CHARAKTER:
Warm, ehrlich, leicht frech, menschlich. Immer per Du. Kein leeres Lob.
Kurze Sätze. Aktiv. Klar. Maximal 2 Sätze am Stück.

PATIENT:
Name: ${userName}
Streak: ${streak} Tage
Körperbereiche: ${bodyAreas.join(', ') || 'allgemeine Mobilität'}
Tageszeit: ${timeLabel}
${motivationLine}
${memoryContext.personalityHints.length ? `Persönlichkeit: ${memoryContext.personalityHints.join('; ')}` : ''}
${memoryContext.patternHints.length ? `Muster: ${memoryContext.patternHints.join('; ')}` : ''}
${memoryContext.lifeContext.length ? `Lebenskontext: ${memoryContext.lifeContext.join('; ')}` : ''}
${lastSessionText}
${fiveWhysInstruction}

AUFGABE:
Du führst live durch eine Physio-Session. Wenn der Nutzer etwas sagt, antworte kurz, hilfreich und direkt bezogen auf seine Frage oder Unsicherheit.
Wenn der Nutzer "Pause" sagt, bestätige kurz und biete an weiterzumachen.
Wenn der Nutzer etwas nicht versteht, erkläre die Übung einfacher.
Wenn der Nutzer Schmerzen meldet, priorisiere Sicherheit und reduziere Intensität.

FORMAT:
Antworte natürlich auf Deutsch. Kein Markdown. Keine Listen. Keine JSON-Ausgabe.`
}
