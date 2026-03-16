import MemoryClient from 'mem0ai'
import { anthropic } from '@/lib/claude/client'
import { extractJson } from '@/lib/claude/extract-json'
import type { ExtractedSessionInsights } from '@/lib/coach/types'
import { logPrivacyAuditEvent } from '@/lib/privacy/audit'
import { classifyMemory } from '@/lib/privacy/classifier'
import { canStoreMemory } from '@/lib/privacy/hooks'
import { DataClass, type ConsentLevel } from '@/lib/privacy/types'

interface Mem0Client {
  add: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: { user_id: string; metadata?: Record<string, unknown> },
  ) => Promise<unknown>
}

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
}) as unknown as Mem0Client

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
  consent: ConsentLevel = 'full',
  options?: { sessionId?: string | null },
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

  const memoryEntries = buildMemoryEntries(insights)

  await Promise.all(memoryEntries.map(async ({ category, content }) => {
    const dataClass = classifyMemory(category, content)
    if (!canStoreMemory({ dataClass, consent })) {
      return
    }

    if (dataClass === DataClass.MedicalRehab) {
      await logPrivacyAuditEvent({
        userId,
        sessionId: options?.sessionId ?? null,
        eventType: 'class_d_write',
        dataClass,
        payload: {
          table: 'mem0',
          action: 'insert',
          data_class: DataClass.MedicalRehab,
          memory_category: category,
        },
      }).catch(() => undefined)
    }

    await mem0.add(
      [{ role: 'user', content }],
      {
        user_id: userId,
        metadata: {
          source: 'session_extraction',
          category,
          data_class: dataClass,
        },
      },
    ).catch(() => undefined)
  }))

  return insights
}

function buildMemoryEntries(insights: ExtractedSessionInsights): Array<{
  category: 'motivation_hints' | 'personality_preferences' | 'training_patterns' | 'life_context'
  content: string
}> {
  const entries: Array<{
    category: 'motivation_hints' | 'personality_preferences' | 'training_patterns' | 'life_context'
    content: string
  }> = []

  if (insights.motivation_hints.length > 0) {
    entries.push({
      category: 'motivation_hints',
      content: `Motivation: ${insights.motivation_hints.join(', ')}`,
    })
  }

  const hasCustomPersonality = insights.personality_preferences.communicationStyle !== 'einfuehlsam'
    || insights.personality_preferences.encouragementType !== 'supportive'
  if (hasCustomPersonality) {
    entries.push({
      category: 'personality_preferences',
      content: `Kommunikationsstil: ${insights.personality_preferences.communicationStyle}; Ermutigung: ${insights.personality_preferences.encouragementType}`,
    })
  }

  const trainingSegments = [
    insights.training_patterns.knownPainPoints.length > 0
      ? `Schmerzpunkte: ${insights.training_patterns.knownPainPoints.join(', ')}`
      : null,
    insights.training_patterns.preferredExercises.length > 0
      ? `Bevorzugte Uebungen: ${insights.training_patterns.preferredExercises.join(', ')}`
      : null,
    insights.training_patterns.fatigueSignals.length > 0
      ? `Ermuedungssignale: ${insights.training_patterns.fatigueSignals.join(', ')}`
      : null,
  ].filter((value): value is string => Boolean(value))

  if (trainingSegments.length > 0) {
    entries.push({
      category: 'training_patterns',
      content: `Trainingsmuster: ${trainingSegments.join(' | ')}`,
    })
  }

  if (insights.life_context.length > 0) {
    entries.push({
      category: 'life_context',
      content: `Lebenskontext: ${insights.life_context.join(', ')}`,
    })
  }

  return entries
}
