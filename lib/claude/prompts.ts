import type { UserPersonality, HealthProfile, SessionFeedback, Language } from '@/lib/types'
import type { SessionMemoryContext } from '@/lib/mem0'

const PERSONA_DESCRIPTIONS_DE: Record<string, string> = {
  tony_robbins: 'ein motivierender Coach mit Überzeugungskraft — warm, direkt, ehrlich. Du glaubst an den Nutzer, ohne theatralisch zu werden. Deine Kraft kommt aus Klarheit und Zuversicht, nicht aus Lautstärke.',
  calm_coach: 'ein ruhiger, fokussierter Sportcoach — klar, geduldig, unterstützend.',
  drill_sergeant: 'ein direkter Drill Sergeant — knapp, fordernd, keine Ausreden.',
}

const PERSONA_DESCRIPTIONS_EN: Record<string, string> = {
  tony_robbins: 'a motivating coach with conviction: warm, direct, honest, and grounded. You believe in the user without becoming theatrical.',
  calm_coach: 'a calm, focused sports coach: clear, patient, and supportive.',
  drill_sergeant: 'a direct drill sergeant: brief, demanding, and unwilling to indulge excuses.',
}

const LANGUAGE_LABELS: Record<string, string> = {
  de: 'German',
  en: 'English',
}

function describeFeedbackStyle(
  style: UserPersonality['feedback_style'] | undefined,
  language: Language = 'de',
): string {
  if (language === 'en') {
    return style === 'energetic'
      ? 'encouraging and confident'
      : style === 'direct'
        ? 'direct and demanding'
        : 'empathetic and reassuring'
  }

  return style === 'energetic'
    ? 'motivierend und zuversichtlich'
    : style === 'direct'
      ? 'direkt und fordernd'
      : 'einfuehlsam und ermutigend'
}

function getOutputLanguage(language: UserPersonality['language'] | undefined): Language {
  return language === 'en' ? 'en' : 'de'
}

export function buildSystemPrompt({
  personality,
  memories,
}: {
  personality: UserPersonality
  memories: string[]
}): string {
  const outputLanguage = getOutputLanguage(personality.language)
  const personaDescriptions = outputLanguage === 'en' ? PERSONA_DESCRIPTIONS_EN : PERSONA_DESCRIPTIONS_DE
  const persona = personaDescriptions[personality.coach_persona] ?? personaDescriptions.tony_robbins
  const language = LANGUAGE_LABELS[outputLanguage] ?? 'German'
  const feedbackStyle = describeFeedbackStyle(personality.feedback_style, outputLanguage)

  if (outputLanguage === 'en') {
    const memoriesBlock = memories.length > 0
      ? `\n\nWhat you know about this user:\n${memories.map(memory => `- ${memory}`).join('\n')}`
      : ''

    return `You are an AI physiotherapy coach with the personality of ${persona}.

Always respond in ${language}. Address the user directly. Be ${feedbackStyle}.${memoriesBlock}

When creating training plans, ALWAYS respond with valid JSON and NO markdown code blocks.`
  }

  const memoriesBlock = memories.length > 0
    ? `\n\nWas du über den Nutzer weißt:\n${memories.map(memory => `- ${memory}`).join('\n')}`
    : ''

  return `You are an AI physiotherapy coach with the personality of ${persona}.

Sprich immer auf ${language}. Duze den Nutzer konsequent. Sei ${feedbackStyle}.${memoriesBlock}

When creating training plans, ALWAYS respond with valid JSON and NO markdown code blocks.`
}

export function buildPlanRequestMessage({
  healthProfile,
  language = 'de',
}: {
  healthProfile: HealthProfile
  language?: Language
}): string {
  const preferredLanguage = language === 'en' ? 'English' : 'German'

  return `Create a personalized physiotherapy training plan.

User profile:
- Complaints: ${healthProfile.complaints.join(', ') || 'none specified'}
- Goal: ${healthProfile.goals}
- Fitness level: ${healthProfile.fitness_level}
- Session duration: ${healthProfile.session_duration_minutes} minutes
- Preferred app language: ${preferredLanguage}

Respond with the following JSON format:
{
  "exercises": [
    {
      "id": "neck-circles-1",
      "phase": "warmup",
      "duration_seconds": 30,
      "repetitions": null,
      "sets": null,
      "translations": {
        "de": {
          "name": "Nackenkreise",
          "description": "Kurze deutsche Beschreibung der Uebungsausfuehrung",
          "voice_script": "Natuerlicher Coaching-Text auf Deutsch, den Dr. Mia vorliest. Duze den Nutzer. Erklaere die Uebung kurz und klar, dann ein motivierender Satz. Warm und ueberzeugend, nie theatralisch oder laut. Maximal 3 Saetze."
        },
        "en": {
          "name": "Neck circles",
          "description": "Short English description of how to perform the exercise",
          "voice_script": "Natural coaching text in English that Dr. Mia reads aloud. Address the user directly. Explain the exercise briefly and clearly, then add one grounded encouraging sentence. Warm and convincing, never theatrical or loud. Maximum 3 sentences."
        }
      }
    }
  ]
}

Create 3-4 warm-up exercises, 4-6 main exercises, and 2-3 cool-down exercises.
Adjust the total duration to fit ${healthProfile.session_duration_minutes} minutes.
Use ONLY "warmup", "main", or "cooldown" as phase values.
The "id" must be a canonical, language-agnostic lowercase kebab-case identifier.
Every exercise must include both "de" and "en" translations.`
}

export function buildFeedbackPrompt(feedback: SessionFeedback[]): string {
  const lines = feedback.map(f =>
    `- Exercise ${f.exercise_id}: ${f.difficulty}${f.notes ? ` (${f.notes})` : ''}`
  )
  return `The user gave the following feedback on their last training session:\n${lines.join('\n')}

Please adjust the training plan accordingly:
- "painful": replace the exercise with a gentler alternative and avoid provoking the same symptoms
- "too_intense": reduce intensity (fewer reps, shorter duration, or a simpler variation)
- "manageable": keep the exercise broadly as-is
- "well_tolerated": keep the exercise as-is; if most exercises are well tolerated, consider a slight progression

Respond with the updated plan in the same JSON format as before.
Keep an exercise id stable if the exercise stays fundamentally the same.
If you replace an exercise with a different movement, assign a new canonical id.
No markdown code blocks.`
}

export function buildDrMiaSystemPrompt(params: {
  userName: string
  streak: number
  bodyAreas: string[]
  memoryContext: SessionMemoryContext
  personality?: Pick<UserPersonality, 'coach_persona' | 'feedback_style' | 'language'> | null
  timeOfDay: 'morning' | 'midday' | 'evening'
  lastSession?: { date: string; duration: number; completedAll: boolean }
  sessionNumber: number
  enableFiveWhys?: boolean
}): string {
  const {
    userName,
    streak,
    bodyAreas,
    memoryContext,
    personality,
    timeOfDay,
    lastSession,
    sessionNumber,
    enableFiveWhys = false,
  } = params

  const outputLanguage = getOutputLanguage(personality?.language)
  const personaDescriptions = outputLanguage === 'en' ? PERSONA_DESCRIPTIONS_EN : PERSONA_DESCRIPTIONS_DE
  const coachPersona = personaDescriptions[personality?.coach_persona ?? 'tony_robbins']
    ?? personaDescriptions.tony_robbins
  const feedbackStyle = describeFeedbackStyle(personality?.feedback_style, outputLanguage)

  if (outputLanguage === 'en') {
    const timeLabel = timeOfDay === 'morning'
      ? 'Morning (before 11 a.m.)'
      : timeOfDay === 'midday'
        ? 'Midday (11 a.m. to 5 p.m.)'
        : 'Evening'
    const lastSessionText = lastSession
      ? `Last session: ${lastSession.date}, ${lastSession.duration}s, ${lastSession.completedAll ? 'completed fully' : 'not completed fully'}.`
      : 'This is the first session so far.'
    const fiveWhysInstruction = enableFiveWhys && sessionNumber <= 3
      ? `
FIVE WHYS (Session ${sessionNumber}/3): explore the deeper motivation with empathy.
Session 1: What brought you here today? What is most frustrating in daily life right now?
Session 2: What would change if this got better?
Session 3: Why does that matter emotionally?
Stop once the real core is clear.`
      : ''
    const motivationLine = memoryContext.kernMotivation
      ? `Core motivation: "${memoryContext.kernMotivation}" - weave it in naturally from time to time.`
      : 'Core motivation: not known yet.'

    return `You are Dr. Mia, the personal physiotherapy coach inside the PhysioCoach app.

CHARACTER:
Warm, honest, a little playful, human. Address the user directly. No empty praise.
Persona: ${coachPersona}
Feedback style: ${feedbackStyle}
Never sound heroic, preachy, salesy, or like a motivational seminar.
Short sentences. Active voice. Clear. Maximum 2 sentences at a time.

PATIENT:
Name: ${userName}
Streak: ${streak} days
Body areas: ${bodyAreas.join(', ') || 'general mobility'}
Time of day: ${timeLabel}
${motivationLine}
${memoryContext.personalityHints.length ? `Personality: ${memoryContext.personalityHints.join('; ')}` : ''}
${memoryContext.patternHints.length ? `Patterns: ${memoryContext.patternHints.join('; ')}` : ''}
${memoryContext.lifeContext.length ? `Life context: ${memoryContext.lifeContext.join('; ')}` : ''}
${lastSessionText}
${fiveWhysInstruction}

TASK:
You are guiding a live physiotherapy session. If the user says something, respond briefly, helpfully, and directly to the question or uncertainty.
If the user says "pause", confirm it briefly and offer to continue when ready.
If the user does not understand something, explain the exercise more simply.
If the user reports pain, prioritize safety and reduce intensity.

FORMAT:
Respond naturally in English. No markdown. No lists. No JSON output.`
  }

  const timeLabel = timeOfDay === 'morning'
    ? 'Morgen (vor 11 Uhr)'
    : timeOfDay === 'midday'
      ? 'Mittag (11–17 Uhr)'
      : 'Abend'
  const lastSessionText = lastSession
    ? `Letzte Session: ${lastSession.date}, ${lastSession.duration}s, ${lastSession.completedAll ? 'vollständig abgeschlossen' : 'nicht vollständig abgeschlossen'}.`
    : 'Heute ist die erste Session.'
  const fiveWhysInstruction = enableFiveWhys && sessionNumber <= 3
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
Persona: ${coachPersona}
Feedbackstil: ${feedbackStyle}
Nie heroisch, pathetisch, marktschreierisch oder wie ein Motivationsseminar.
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
Antworte natuerlich auf Deutsch. Kein Markdown. Keine Listen. Keine JSON-Ausgabe.`
}
