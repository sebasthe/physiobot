export type UtteranceCategory = 'command' | 'question' | 'feedback' | 'filler' | 'acknowledgment'

export interface ClassificationResult {
  category: UtteranceCategory
  confidence: number
  fastPath: boolean
  commandName?: string
}

const COMMAND_PATTERNS: Array<{ pattern: RegExp; commandName: string }> = [
  { pattern: /^(naechste|nächste|weiter|next)(?:\s+uebung|\s+übung)?[.!?…]*$/i, commandName: 'next_exercise' },
  { pattern: /^(zurueck|zurück|back)[.!?…]*$/i, commandName: 'previous_exercise' },
  { pattern: /^(pause|stopp|stop)[.!?…]*$/i, commandName: 'pause_workout' },
  { pattern: /^(weiter\s*machen|resume|fortsetzen)[.!?…]*$/i, commandName: 'resume_workout' },
  { pattern: /^(fertig|geschafft|done|satz\s*fertig)[.!?…]*$/i, commandName: 'mark_set_complete' },
  { pattern: /^(aufhoeren|aufhören|ende|beenden|schluss)[.!?…]*$/i, commandName: 'end_session' },
]

const FILLER_PATTERNS = /^(ähm?|aehm?|äh|aeh|hmm?|mhm|hm|uff|puh|oh|ah)[.!?…]*$/i
const ACKNOWLEDGMENT_PATTERNS = /^(ok|okay|ja|jo|alles\s*klar|verstanden|gut|genau|klar|passt)[.!?…]*$/i

export async function classifyUtterance(text: string): Promise<ClassificationResult> {
  const trimmed = text.trim()

  if (FILLER_PATTERNS.test(trimmed)) {
    return {
      category: 'filler',
      confidence: 1,
      fastPath: true,
    }
  }

  if (ACKNOWLEDGMENT_PATTERNS.test(trimmed)) {
    return {
      category: 'acknowledgment',
      confidence: 1,
      fastPath: true,
    }
  }

  for (const { pattern, commandName } of COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        category: 'command',
        confidence: 1,
        fastPath: true,
        commandName,
      }
    }
  }

  if (typeof window !== 'undefined') {
    return {
      category: 'question',
      confidence: 0.3,
      fastPath: false,
    }
  }

  try {
    const { anthropic } = await import('@/lib/claude/client')
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: [
        'Classify the user utterance into exactly one category and answer with JSON only.',
        '{"category":"command|question|feedback|filler|acknowledgment","confidence":0.0-1.0,"commandName":"optional"}',
        'command: direct instruction to the app or workout flow.',
        'question: asks how/what/why about the exercise or training.',
        'feedback: reports pain, fatigue, difficulty, effort, or body state.',
        'filler: filler word, hesitation, noise, or non-semantic speech.',
        'acknowledgment: short confirmation like ok, yes, understood.',
        'Only set commandName when the instruction clearly maps to one of: next_exercise, previous_exercise, pause_workout, resume_workout, mark_set_complete, end_session.',
      ].join(' '),
      messages: [{ role: 'user', content: trimmed }],
    })

    const textBlock = response.content.find(item => item.type === 'text')
    const responseText = textBlock?.type === 'text' ? textBlock.text : ''
    const parsed = parseClassificationResult(responseText)
    if (parsed) {
      return parsed
    }
  } catch {
    // Fall through to the safest default.
  }

  return {
    category: 'question',
    confidence: 0.3,
    fastPath: false,
  }
}

function parseClassificationResult(raw: string): ClassificationResult | null {
  if (!raw.trim()) {
    return null
  }

  const candidate = extractJsonObject(raw)
  if (!candidate) {
    return null
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>
    const category = normalizeCategory(parsed.category)
    if (!category) {
      return null
    }

    const result: ClassificationResult = {
      category,
      confidence: typeof parsed.confidence === 'number' ? clamp(parsed.confidence, 0, 1) : 0.5,
      fastPath: false,
    }

    if (category === 'command') {
      const commandName = normalizeCommandName(parsed.commandName)
      if (commandName) {
        result.commandName = commandName
      }
    }

    return result
  } catch {
    return null
  }
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  return raw.slice(start, end + 1)
}

function normalizeCategory(value: unknown): UtteranceCategory | null {
  return value === 'command'
    || value === 'question'
    || value === 'feedback'
    || value === 'filler'
    || value === 'acknowledgment'
    ? value
    : null
}

function normalizeCommandName(value: unknown): string | undefined {
  return value === 'next_exercise'
    || value === 'previous_exercise'
    || value === 'pause_workout'
    || value === 'resume_workout'
    || value === 'mark_set_complete'
    || value === 'end_session'
    ? value
    : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
