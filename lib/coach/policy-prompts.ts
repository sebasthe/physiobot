import type { CoachMode, CoachingMemorySnapshot } from './types'

function buildMemoryBlock(memory: CoachingMemorySnapshot): string {
  const lines: string[] = []

  if (memory.kernMotivation) {
    lines.push(`Kern-Motivation des Nutzers: "${memory.kernMotivation}"`)
  }

  if (memory.personalityPrefs) {
    lines.push(
      `Kommunikationsstil: ${memory.personalityPrefs.communicationStyle}, Ermutigung: ${memory.personalityPrefs.encouragementType}`,
    )
  }

  if (memory.trainingPatterns) {
    if (memory.trainingPatterns.knownPainPoints.length > 0) {
      lines.push(`Bekannte Schmerzpunkte: ${memory.trainingPatterns.knownPainPoints.join(', ')}`)
    }
    if (memory.trainingPatterns.preferredExercises.length > 0) {
      lines.push(`Bevorzugte Uebungen: ${memory.trainingPatterns.preferredExercises.join(', ')}`)
    }
    if (memory.trainingPatterns.fatigueSignals.length > 0) {
      lines.push(`Ermuedungssignale: ${memory.trainingPatterns.fatigueSignals.join(', ')}`)
    }
  }

  if (memory.lifeContext.length > 0) {
    lines.push(`Lebenskontext: ${memory.lifeContext.join(', ')}`)
  }

  lines.push(`Session-Nummer: ${memory.sessionCount}`)

  return lines.length > 0 ? `\n\n## Nutzer-Kontext\n${lines.join('\n')}` : ''
}

const POLICY: Record<CoachMode, string> = {
  performance: `Du bist im Performance-Modus. Der Nutzer trainiert gerade aktiv.

Regeln:
- Antworte kurz und knapp, maximal 1-2 Saetze
- Gib kurze motivierende Tempo-, Zaehler- oder Fokus-Cues
- Keine langen Erklaerungen waehrend des Satzes
- Kurz heisst kurz`,

  guidance: `Du bist im Guidance-Modus. Der Nutzer ist in einer Pause oder zwischen Uebungen.

Regeln:
- Technik-Tipps und Form-Korrekturen sind erlaubt
- Erklaere kurz, was als Naechstes kommt
- Beantworte Fragen zur Technik konkret
- Maximal 3 Saetze`,

  safety: `Du bist im Safety-Modus. Der Nutzer hat Schmerzen, Unsicherheit oder Ueberforderung gemeldet.

Regeln:
- Sicherheit geht vor
- Sage klar: stopp oder pause
- Frage knapp nach Ort, Staerke und Beginn der Beschwerden
- Schlage nur sichere Modifikationen oder Alternativen vor
- Niemals zum Weitermachen trotz Schmerzen druecken`,

  motivation: `Du bist im Motivations-Modus. Erkunde die tiefere Motivation des Nutzers.

Regeln:
- Nutze die Five Whys Methode
- Frage sanft: Warum ist dir das wichtig?
- Stelle nur eine Frage pro Antwort
- Bleibe einfuehlsam und wertschaetzend`,
}

export function buildCoachPolicyPrompt(mode: CoachMode, memory: CoachingMemorySnapshot): string {
  return `${POLICY[mode]}${buildMemoryBlock(memory)}`
}
