import type { UserPersonality, HealthProfile, SessionFeedback } from '@/lib/types'

const PERSONA_DESCRIPTIONS: Record<string, string> = {
  tony_robbins: 'Tony Robbins — energiegeladen, motivierend, mit Kraft und Überzeugung. Du gibst dem Nutzer das Gefühl, alles erreichen zu können.',
  calm_coach: 'ein ruhiger, fokussierter Sportcoach — klar, geduldig, unterstützend.',
  drill_sergeant: 'ein direkter Drill Sergeant — knapp, fordernd, keine Ausreden.',
}

const LANGUAGE_LABELS: Record<string, string> = {
  de: 'Deutsch',
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
  const language = LANGUAGE_LABELS[personality.language] ?? 'Deutsch'

  const memoriesBlock = memories.length > 0
    ? `\n\nWas du über diesen Nutzer weißt:\n${memories.map(m => `- ${m}`).join('\n')}`
    : ''

  const feedbackStyle =
    personality.feedback_style === 'energetic' ? 'energiegeladen und motivierend' :
    personality.feedback_style === 'direct' ? 'direkt und fordernd' :
    'sanft und ermutigend'

  return `Du bist ein AI-Physiotherapie-Coach mit der Persönlichkeit von ${persona}

Sprich immer auf ${language}. Sei ${feedbackStyle}.${memoriesBlock}

Wenn du Trainingspläne erstellst, antworte IMMER als valides JSON ohne Markdown-Codeblöcke.`
}

export function buildPlanRequestMessage({
  healthProfile,
}: {
  healthProfile: HealthProfile
}): string {
  return `Erstelle einen personalisierten Physiotherapie-Trainingsplan.

Nutzer-Profil:
- Beschwerden: ${healthProfile.complaints.join(', ') || 'keine spezifischen'}
- Trainingsziel: ${healthProfile.goals}
- Fitnesslevel: ${healthProfile.fitness_level}
- Trainingsdauer: ${healthProfile.session_duration_minutes} Minuten

Antworte mit folgendem JSON-Format:
{
  "exercises": [
    {
      "name": "Übungsname",
      "description": "Kurze Beschreibung wie die Übung ausgeführt wird",
      "phase": "warmup",
      "duration_seconds": 30,
      "repetitions": null,
      "sets": null,
      "voice_script": "Motivierender Text den der Coach vorliest"
    }
  ]
}

Erstelle 3-4 Aufwärmübungen, 4-6 Hauptübungen und 2-3 Cooldown-Übungen.
Passe die Gesamtdauer auf ${healthProfile.session_duration_minutes} Minuten an.
Verwende NUR "warmup", "main" oder "cooldown" als phase-Werte.`
}

export function buildFeedbackPrompt(feedback: SessionFeedback[]): string {
  const lines = feedback.map(f =>
    `- Übung ${f.exercise_id}: ${f.difficulty}${f.notes ? ` (${f.notes})` : ''}`
  )
  return `Der Nutzer hat folgendes Feedback zur letzten Trainingseinheit gegeben:\n${lines.join('\n')}

Bitte passe den Trainingsplan entsprechend an:
- Bei "painful": Übung durch eine sanftere Alternative ersetzen
- Bei "too_hard": Intensität reduzieren (weniger Wdh., kürzere Dauer)
- Bei "too_easy": Intensität erhöhen
- Bei "right": Übung beibehalten

Antworte mit dem aktualisierten Plan im gleichen JSON-Format wie zuvor.`
}
