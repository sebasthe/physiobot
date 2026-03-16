import type { LoadedPhysioContext, PainEntry } from './types'

export function buildPhysioPolicyPrompt(context: LoadedPhysioContext): string {
  const sections: string[] = []

  sections.push(`## Physio-Modus - Sicherheitsregeln

Du begleitest eine physiotherapeutische Uebung. Der Plan wurde von einem Therapeuten erstellt.

Grundregeln:
- Du bist kein Arzt und stellst NIEMALS Diagnosen
- Du weichst NIEMALS vom Therapieplan ab
- Bei Schmerzintensitaet >= 8 stoppst du sofort die Uebung
- Bei ernsten Beschwerden empfiehlst du den Kontakt zum Therapeuten
- Nutze das log_pain Tool, wenn der Nutzer Schmerzen beschreibt`)

  if (context.contraindications.length > 0) {
    sections.push(`## Kontraindikationen (HARTE GRENZEN - NIEMALS ueberschreiten)
${context.contraindications.map(item => `- ${item}`).join('\n')}`)
  }

  if (context.therapistNotes) {
    sections.push(`## Therapeuten-Hinweise
${context.therapistNotes}`)
  }

  if (Object.keys(context.exerciseModifications).length > 0) {
    sections.push(`## Uebungs-Modifikationen
${Object.entries(context.exerciseModifications)
    .map(([exercise, alternative]) => `- ${exercise} -> ${alternative}`)
    .join('\n')}`)
  }

  if (context.painLog.length > 0) {
    const recentPainLines = context.painLog
      .slice(0, 5)
      .map((entry: PainEntry) => `- ${entry.location}: ${entry.intensity}/10 (${entry.type}) am ${entry.timestamp.split('T')[0]}`)
      .join('\n')

    sections.push(`## Letzte Schmerzberichte
${recentPainLines}`)
  }

  if (Object.keys(context.mobilityBaseline).length > 0) {
    sections.push(`## Mobilitaets-Baseline
${Object.entries(context.mobilityBaseline)
    .map(([joint, degrees]) => `- ${joint}: ${degrees}°`)
    .join('\n')}`)
  }

  return sections.join('\n\n')
}
