import MemoryClient from 'mem0ai'
import { anthropic } from '@/lib/claude/client'
import { extractJson } from '@/lib/claude/extract-json'
import type { ExtractedSessionInsights } from '@/lib/coach/types'

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
})

const EXTRACTION_PROMPT = `Analysiere das folgende Trainingsgespraech und extrahiere strukturierte Erkenntnisse.

Antworte NUR mit einem JSON-Objekt in diesem Format:
{
  "motivation_hints": ["..."],
  "personality_preferences": { "communicationStyle": "direkt|einfuehlsam", "encouragementType": "challenge-driven|supportive" },
  "training_patterns": { "knownPainPoints": ["..."], "preferredExercises": ["..."], "fatigueSignals": ["..."] },
  "life_context": ["..."]
}

Regeln:
- Nur stabile, wiederkehrende Muster extrahieren
- Leere Arrays verwenden, wenn nichts belastbar ist
- Keine Vermutungen`

function normalizeInsights(value: Partial<ExtractedSessionInsights> | null | undefined): ExtractedSessionInsights {
  return {
    motivation_hints: Array.isArray(value?.motivation_hints) ? value.motivation_hints : [],
    personality_preferences: {
      communicationStyle: value?.personality_preferences?.communicationStyle ?? 'einfuehlsam',
      encouragementType: value?.personality_preferences?.encouragementType ?? 'supportive',
    },
    training_patterns: {
      knownPainPoints: Array.isArray(value?.training_patterns?.knownPainPoints)
        ? value.training_patterns.knownPainPoints
        : [],
      preferredExercises: Array.isArray(value?.training_patterns?.preferredExercises)
        ? value.training_patterns.preferredExercises
        : [],
      fatigueSignals: Array.isArray(value?.training_patterns?.fatigueSignals)
        ? value.training_patterns.fatigueSignals
        : [],
    },
    life_context: Array.isArray(value?.life_context) ? value.life_context : [],
  }
}

export async function extractSessionInsights(
  userId: string,
  transcript: Array<{ role: string; content: string }>,
): Promise<ExtractedSessionInsights> {
  const conversationText = transcript
    .map(message => `${message.role === 'user' ? 'Nutzer' : 'Coach'}: ${message.content}`)
    .join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    system: EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: conversationText }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  const insights = normalizeInsights(
    textBlock?.type === 'text'
      ? extractJson<Partial<ExtractedSessionInsights>>(textBlock.text)
      : null,
  )

  const memoryEntries = [
    insights.motivation_hints.length > 0 ? `Motivation: ${insights.motivation_hints.join(', ')}` : null,
    insights.training_patterns.knownPainPoints.length > 0
      ? `Schmerzpunkte: ${insights.training_patterns.knownPainPoints.join(', ')}`
      : null,
    insights.life_context.length > 0 ? `Lebenskontext: ${insights.life_context.join(', ')}` : null,
  ].filter((entry): entry is string => Boolean(entry))

  await Promise.all(memoryEntries.map(entry =>
    mem0.add(
      [{ role: 'user', content: entry }],
      {
        user_id: userId,
        metadata: { source: 'session_extraction' },
      },
    ).catch(() => undefined),
  ))

  return insights
}
