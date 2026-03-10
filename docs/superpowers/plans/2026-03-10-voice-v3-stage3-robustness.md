# Voice V3 Stage 3: Robustness & Quality

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add utterance classification (skip full LLM turns for commands/noise), edge case handling (debounce, timeouts, silence escalation), observability dashboard, and performance budgets.

**Architecture:** A lightweight Haiku classifier runs before the full LLM turn to categorize user input. Commands with high confidence route directly to tool execution. Edge cases are handled by a resilience layer wrapping the TurnManager. Telemetry is extended with latency breakdowns and quality signals, viewable on an admin page.

**Tech Stack:** TypeScript, Claude Haiku (classifier), Vitest, Supabase (telemetry)

**Branch:** `feature/voice-v3-hardening` (create from `main` after Stage 2 is merged)

**Spec:** `docs/superpowers/specs/2026-03-10-voice-v3-staged-design.md` — Stage 3

**Prerequisite:** Stage 2 must be merged to `main`.

---

## Chunk 1: Utterance Classification

### Task 1: Create utterance classifier

**Files:**
- Create: `lib/coach/utterance-classifier.ts`
- Test: `tests/lib/coach/utterance-classifier.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/coach/utterance-classifier.test.ts
import { describe, it, expect, vi } from 'vitest'
import { classifyUtterance, type UtteranceCategory } from '@/lib/coach/utterance-classifier'

// Mock Anthropic for LLM-based classification
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"category":"command","confidence":0.95}' }],
      }),
    },
  })),
}))

describe('classifyUtterance', () => {
  it('classifies "Nächste Übung" as command', async () => {
    const result = await classifyUtterance('Nächste Übung')
    expect(result.category).toBe('command')
    expect(result.confidence).toBeGreaterThan(0.8)
  })

  it('classifies "Ähm" as filler via fast path (no LLM call)', async () => {
    const result = await classifyUtterance('Ähm')
    expect(result.category).toBe('filler')
  })

  it('classifies "Ok" as acknowledgment via fast path', async () => {
    const result = await classifyUtterance('Ok')
    expect(result.category).toBe('acknowledgment')
  })

  it('classifies "Ja" as acknowledgment', async () => {
    const result = await classifyUtterance('Ja')
    expect(result.category).toBe('acknowledgment')
  })

  it('returns category and confidence', async () => {
    const result = await classifyUtterance('Was mache ich als nächstes?')
    expect(result).toHaveProperty('category')
    expect(result).toHaveProperty('confidence')
  })
})

describe('fast path classification', () => {
  it('matches known command patterns without LLM', async () => {
    const commands = ['Pause', 'Weiter', 'Stop', 'Nächste', 'Zurück']
    for (const cmd of commands) {
      const result = await classifyUtterance(cmd)
      expect(result.category).toBe('command')
      expect(result.fastPath).toBe(true)
    }
  })

  it('matches filler patterns without LLM', async () => {
    const fillers = ['Ähm', 'Äh', 'Hmm', 'Mhm']
    for (const filler of fillers) {
      const result = await classifyUtterance(filler)
      expect(result.category).toBe('filler')
      expect(result.fastPath).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/coach/utterance-classifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the classifier**

```typescript
// lib/coach/utterance-classifier.ts
import Anthropic from '@anthropic-ai/sdk'

export type UtteranceCategory = 'command' | 'question' | 'feedback' | 'filler' | 'acknowledgment'

export interface ClassificationResult {
  category: UtteranceCategory
  confidence: number
  fastPath: boolean
  commandName?: string  // For direct tool routing
}

// Fast-path patterns — no LLM needed
const COMMAND_PATTERNS: Array<{ pattern: RegExp; command?: string }> = [
  { pattern: /^(nächste|weiter|next)\b/i, command: 'next_exercise' },
  { pattern: /^(zurück|back)\b/i, command: 'previous_exercise' },
  { pattern: /^(pause|stopp|stop)\b/i, command: 'pause_workout' },
  { pattern: /^(weiter\s*machen|resume|fortsetzen)\b/i, command: 'resume_workout' },
  { pattern: /^(fertig|geschafft|done|satz\s*fertig)\b/i, command: 'mark_set_complete' },
  { pattern: /^(aufhören|ende|beenden|schluss)\b/i, command: 'end_session' },
]

const FILLER_PATTERNS = /^(ähm?|äh|hmm?|mhm|hm|uff|puh|oh|ah)\.?$/i
const ACKNOWLEDGMENT_PATTERNS = /^(ok|okay|ja|jo|alles\s*klar|verstanden|gut|genau|klar|passt)\.?$/i

const anthropic = new Anthropic()

export async function classifyUtterance(text: string): Promise<ClassificationResult> {
  const trimmed = text.trim()

  // Fast path: exact pattern matches
  if (FILLER_PATTERNS.test(trimmed)) {
    return { category: 'filler', confidence: 1.0, fastPath: true }
  }

  if (ACKNOWLEDGMENT_PATTERNS.test(trimmed)) {
    return { category: 'acknowledgment', confidence: 1.0, fastPath: true }
  }

  for (const { pattern, command } of COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { category: 'command', confidence: 1.0, fastPath: true, commandName: command }
    }
  }

  // LLM path: classify ambiguous utterances
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: `Klassifiziere die Nutzer-Aussage in genau eine Kategorie.
Antworte NUR mit JSON: {"category":"command|question|feedback|filler|acknowledgment","confidence":0.0-1.0}
- command: Anweisung an die App (nächste Übung, Pause, etc.)
- question: Frage zur Übung oder zum Training
- feedback: Rückmeldung über Befinden (Schmerz, Schwierigkeit, Müdigkeit)
- filler: Geräusch, Räuspern, Füllwort
- acknowledgment: Kurze Bestätigung (ok, ja, verstanden)`,
      messages: [{ role: 'user', content: trimmed }],
    })

    const responseText = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(responseText)
    return {
      category: parsed.category as UtteranceCategory,
      confidence: parsed.confidence ?? 0.5,
      fastPath: false,
    }
  } catch {
    // Fallback: treat as question (safest default — will get full LLM turn)
    return { category: 'question', confidence: 0.3, fastPath: false }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/coach/utterance-classifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/coach/utterance-classifier.ts tests/lib/coach/utterance-classifier.test.ts
git commit -m "feat(coach): add utterance classifier with fast-path patterns"
```

---

### Task 2: Integrate classifier into turn flow

**Files:**
- Modify: `lib/voice-module/core/TurnManager.ts`
- Modify: `lib/voice/server-orchestrator.ts`
- Test: `tests/lib/voice-module/core/TurnManager-classification.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/core/TurnManager-classification.test.ts
import { describe, it, expect, vi } from 'vitest'
import { TurnManager } from '@/lib/voice-module/core/TurnManager'
import { VoiceEventEmitter } from '@/lib/voice-module/core/events'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'
import type { StreamChunk, TurnContext } from '@/lib/voice-module/core/types'

vi.mock('@/lib/coach/utterance-classifier', () => ({
  classifyUtterance: vi.fn().mockImplementation((text: string) => {
    if (text === 'Pause') return Promise.resolve({ category: 'command', confidence: 1.0, fastPath: true, commandName: 'pause_workout' })
    if (text === 'Ähm') return Promise.resolve({ category: 'filler', confidence: 1.0, fastPath: true })
    if (text === 'Ok') return Promise.resolve({ category: 'acknowledgment', confidence: 1.0, fastPath: true })
    return Promise.resolve({ category: 'question', confidence: 0.8, fastPath: false })
  }),
}))

const makeMockTTS = (): TTSProvider => ({
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isSpeaking: vi.fn(() => false),
})

async function* mockStream(): AsyncGenerator<StreamChunk> {
  yield { type: 'delta', text: 'Response' }
  yield { type: 'done', reply: 'Response', llmLatencyMs: 50, totalLatencyMs: 100 }
}

describe('TurnManager with classification', () => {
  it('skips LLM for filler utterances', async () => {
    const events = new VoiceEventEmitter()
    const tts = makeMockTTS()
    const llm: LLMProvider = { streamTurn: vi.fn(() => mockStream()) }
    const turn = new TurnManager({ events, tts, llm, enableClassification: true })

    await turn.handleUserMessage('Ähm', { systemPrompt: 'test' }, [])
    expect(llm.streamTurn).not.toHaveBeenCalled()
    expect(tts.speak).not.toHaveBeenCalled()
  })

  it('routes commands directly to tool_call', async () => {
    const events = new VoiceEventEmitter()
    const tts = makeMockTTS()
    const llm: LLMProvider = { streamTurn: vi.fn(() => mockStream()) }
    const turn = new TurnManager({ events, tts, llm, enableClassification: true })

    const toolCalls: unknown[] = []
    events.on('toolCall', (t) => toolCalls.push(t))

    await turn.handleUserMessage('Pause', { systemPrompt: 'test' }, [])
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toEqual({ name: 'pause_workout', input: {} })
    // LLM should NOT have been called
    expect(llm.streamTurn).not.toHaveBeenCalled()
  })

  it('sends acknowledgments to TTS with short response', async () => {
    const events = new VoiceEventEmitter()
    const tts = makeMockTTS()
    const llm: LLMProvider = { streamTurn: vi.fn(() => mockStream()) }
    const turn = new TurnManager({ events, tts, llm, enableClassification: true })

    await turn.handleUserMessage('Ok', { systemPrompt: 'test' }, [])
    expect(llm.streamTurn).not.toHaveBeenCalled()
    // May or may not speak a short confirmation
  })

  it('passes questions through to full LLM turn', async () => {
    const events = new VoiceEventEmitter()
    const tts = makeMockTTS()
    const llm: LLMProvider = { streamTurn: vi.fn(() => mockStream()) }
    const turn = new TurnManager({ events, tts, llm, enableClassification: true })

    await turn.handleUserMessage('Wie mache ich das richtig?', { systemPrompt: 'test' }, [])
    expect(llm.streamTurn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/core/TurnManager-classification.test.ts`
Expected: FAIL — `enableClassification` option not recognized

- [ ] **Step 3: Add classification to TurnManager**

In `lib/voice-module/core/TurnManager.ts`:
1. Add `enableClassification?: boolean` to `TurnManagerConfig`
2. At the start of `handleUserMessage()`, if enabled, call `classifyUtterance(text)`
3. Route based on result:
   - `filler`: return immediately, no state change
   - `command` with `commandName`: emit `toolCall` directly, skip LLM
   - `acknowledgment`: optionally speak a short confirmation, skip LLM
   - `question` / `feedback`: proceed to full LLM turn (with mode from Stage 2)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/core/TurnManager-classification.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/core/TurnManager.ts tests/lib/voice-module/core/TurnManager-classification.test.ts
git commit -m "feat(voice-module): integrate utterance classification into turn flow"
```

---

## Chunk 2: Edge Case Handling

### Task 3: Add debounce and interrupt queue

**Files:**
- Create: `lib/voice-module/core/resilience.ts`
- Test: `tests/lib/voice-module/core/resilience.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/core/resilience.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Debouncer, SilenceEscalator } from '@/lib/voice-module/core/resilience'

describe('Debouncer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('debounces rapid calls', () => {
    const handler = vi.fn()
    const debouncer = new Debouncer(300)

    debouncer.call(handler)
    debouncer.call(handler)
    debouncer.call(handler)

    expect(handler).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('cancels pending call', () => {
    const handler = vi.fn()
    const debouncer = new Debouncer(300)

    debouncer.call(handler)
    debouncer.cancel()
    vi.advanceTimersByTime(300)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('SilenceEscalator', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires nudge after first threshold', () => {
    const onNudge = vi.fn()
    const onCheck = vi.fn()
    const onPause = vi.fn()
    const escalator = new SilenceEscalator({
      nudgeAfterMs: 30000,
      checkAfterMs: 60000,
      pauseAfterMs: 90000,
      onNudge,
      onCheck,
      onPause,
    })

    escalator.start()
    vi.advanceTimersByTime(30000)
    expect(onNudge).toHaveBeenCalledTimes(1)
    expect(onCheck).not.toHaveBeenCalled()
  })

  it('fires check after second threshold', () => {
    const onNudge = vi.fn()
    const onCheck = vi.fn()
    const onPause = vi.fn()
    const escalator = new SilenceEscalator({
      nudgeAfterMs: 30000,
      checkAfterMs: 60000,
      pauseAfterMs: 90000,
      onNudge,
      onCheck,
      onPause,
    })

    escalator.start()
    vi.advanceTimersByTime(60000)
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it('fires pause after third threshold', () => {
    const onPause = vi.fn()
    const escalator = new SilenceEscalator({
      nudgeAfterMs: 30000,
      checkAfterMs: 60000,
      pauseAfterMs: 90000,
      onNudge: vi.fn(),
      onCheck: vi.fn(),
      onPause,
    })

    escalator.start()
    vi.advanceTimersByTime(90000)
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('reset clears all timers', () => {
    const onNudge = vi.fn()
    const escalator = new SilenceEscalator({
      nudgeAfterMs: 30000,
      checkAfterMs: 60000,
      pauseAfterMs: 90000,
      onNudge,
      onCheck: vi.fn(),
      onPause: vi.fn(),
    })

    escalator.start()
    vi.advanceTimersByTime(15000)
    escalator.reset() // User spoke — reset
    vi.advanceTimersByTime(30000) // Would have fired if not reset
    expect(onNudge).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/core/resilience.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write resilience utilities**

```typescript
// lib/voice-module/core/resilience.ts

export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null
  private delayMs: number

  constructor(delayMs: number) {
    this.delayMs = delayMs
  }

  call(fn: () => void): void {
    this.cancel()
    this.timer = setTimeout(fn, this.delayMs)
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

interface SilenceEscalatorConfig {
  nudgeAfterMs: number
  checkAfterMs: number
  pauseAfterMs: number
  onNudge: () => void
  onCheck: () => void
  onPause: () => void
}

export class SilenceEscalator {
  private config: SilenceEscalatorConfig
  private timers: ReturnType<typeof setTimeout>[] = []

  constructor(config: SilenceEscalatorConfig) {
    this.config = config
  }

  start(): void {
    this.clear()
    this.timers.push(setTimeout(() => this.config.onNudge(), this.config.nudgeAfterMs))
    this.timers.push(setTimeout(() => this.config.onCheck(), this.config.checkAfterMs))
    this.timers.push(setTimeout(() => this.config.onPause(), this.config.pauseAfterMs))
  }

  reset(): void {
    this.clear()
    this.start()
  }

  stop(): void {
    this.clear()
  }

  private clear(): void {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/core/resilience.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/core/resilience.ts tests/lib/voice-module/core/resilience.test.ts
git commit -m "feat(voice-module): add debounce and silence escalation utilities"
```

---

### Task 4: Add STT confidence threshold

**Files:**
- Modify: `lib/voice-module/core/VoiceSession.ts`
- Test: `tests/lib/voice-module/core/stt-confidence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/core/stt-confidence.test.ts
import { describe, it, expect, vi } from 'vitest'
import { shouldRequestRepeat } from '@/lib/voice-module/core/stt-utils'

describe('shouldRequestRepeat', () => {
  it('returns false for normal length text', () => {
    expect(shouldRequestRepeat('Nächste Übung bitte')).toBe(false)
  })

  it('returns true for very short garbled text', () => {
    expect(shouldRequestRepeat('x')).toBe(true)
  })

  it('returns true for text that is just noise characters', () => {
    expect(shouldRequestRepeat('...')).toBe(true)
  })

  it('returns false for short but valid text', () => {
    expect(shouldRequestRepeat('Ja')).toBe(false)
  })
})
```

- [ ] **Step 2: Write the utility**

```typescript
// lib/voice-module/core/stt-utils.ts

const VALID_SHORT = /^(ja|jo|ok|nein|stop|pause|weiter|fertig|gut|nächste|zurück)$/i

export function shouldRequestRepeat(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return true
  if (trimmed.length <= 2 && !VALID_SHORT.test(trimmed)) return true
  if (/^[.\-_!?…]+$/.test(trimmed)) return true
  return false
}
```

- [ ] **Step 3: Run test and verify**

Run: `npx vitest run tests/lib/voice-module/core/stt-confidence.test.ts`
Expected: PASS

- [ ] **Step 4: Wire into VoiceSession**

In `VoiceSession.ts`, when receiving a committed transcript from STT:
1. Call `shouldRequestRepeat(text)`
2. If true, speak "Kannst du das nochmal sagen?" and resume listening
3. If false, proceed to `sendMessage()`

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/core/stt-utils.ts tests/lib/voice-module/core/stt-confidence.test.ts lib/voice-module/core/VoiceSession.ts
git commit -m "feat(voice-module): add STT confidence filter with repeat request"
```

---

### Task 5: Add network timeout and TTS queue limits

**Files:**
- Modify: `lib/voice-module/core/TurnManager.ts`
- Test: `tests/lib/voice-module/core/TurnManager-resilience.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/core/TurnManager-resilience.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TurnManager } from '@/lib/voice-module/core/TurnManager'
import { VoiceEventEmitter } from '@/lib/voice-module/core/events'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'
import type { StreamChunk, TurnContext } from '@/lib/voice-module/core/types'

describe('TurnManager resilience', () => {
  it('times out if LLM takes too long', async () => {
    const events = new VoiceEventEmitter()
    const tts: TTSProvider = { speak: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), isSpeaking: () => false }

    async function* slowStream(): AsyncGenerator<StreamChunk> {
      await new Promise((resolve) => setTimeout(resolve, 10000))
      yield { type: 'delta', text: 'late' }
      yield { type: 'done', reply: 'late', llmLatencyMs: 10000, totalLatencyMs: 10000 }
    }
    const llm: LLMProvider = { streamTurn: vi.fn(() => slowStream()) }
    const turn = new TurnManager({ events, tts, llm, timeoutMs: 100 })

    const errors: Error[] = []
    events.on('error', (e) => errors.push(e))

    await turn.handleUserMessage('Test', { systemPrompt: 'test' }, [])
    // Should have timed out and spoken a fallback
    expect(tts.speak).toHaveBeenCalledWith(expect.stringContaining('Moment'))
  })

  it('limits TTS queue depth', async () => {
    const events = new VoiceEventEmitter()
    const spokenTexts: string[] = []
    const tts: TTSProvider = {
      speak: vi.fn(async (t) => { spokenTexts.push(t) }),
      stop: vi.fn(),
      isSpeaking: () => false,
    }

    // Generate many chunks to overflow queue
    async function* manyChunks(): AsyncGenerator<StreamChunk> {
      for (let i = 0; i < 20; i++) {
        yield { type: 'delta', text: `Satz ${i}. ` }
      }
      yield { type: 'done', reply: 'many', llmLatencyMs: 50, totalLatencyMs: 100 }
    }
    const llm: LLMProvider = { streamTurn: vi.fn(() => manyChunks()) }
    const turn = new TurnManager({ events, tts, llm, maxQueueDepth: 5 })

    await turn.handleUserMessage('Test', { systemPrompt: 'test' }, [])
    // Queue should have been limited
    expect(spokenTexts.length).toBeLessThanOrEqual(10) // Some dropped
  })
})
```

- [ ] **Step 2: Add timeout and queue limits to TurnManager**

In `lib/voice-module/core/TurnManager.ts`:
1. Add `timeoutMs?: number` and `maxQueueDepth?: number` to config (defaults: 5000ms timeout, 10 queue depth)
2. Wrap the stream iteration with `Promise.race([streamLoop, timeoutPromise])`
3. On timeout: speak "Moment bitte..." via browser TTS fallback, emit error
4. In speech queue: if `speechQueue.length > maxQueueDepth`, drop oldest entries

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/core/TurnManager-resilience.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/voice-module/core/TurnManager.ts tests/lib/voice-module/core/TurnManager-resilience.test.ts
git commit -m "feat(voice-module): add timeout and TTS queue depth limits"
```

---

## Chunk 3: Observability & Performance

### Task 6: Extend telemetry with latency breakdowns

**Files:**
- Create: `lib/telemetry/voice-metrics.ts`
- Modify: `app/api/voice/telemetry/route.ts`
- Test: `tests/lib/telemetry/voice-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/telemetry/voice-metrics.test.ts
import { describe, it, expect } from 'vitest'
import { TurnMetrics, computeTurnMetrics } from '@/lib/telemetry/voice-metrics'

describe('computeTurnMetrics', () => {
  it('computes all latency segments', () => {
    const metrics = computeTurnMetrics({
      sttCommitTime: 1000,
      classificationDoneTime: 1150,
      llmFirstTokenTime: 1400,
      llmDoneTime: 1800,
      ttsStartTime: 1450,
      ttsDoneTime: 2200,
    })

    expect(metrics.sttToClassification).toBe(150)
    expect(metrics.classificationToFirstToken).toBe(250)
    expect(metrics.llmFirstToken).toBe(400)
    expect(metrics.llmTotal).toBe(800)
    expect(metrics.totalTurnTime).toBe(1200)
  })

  it('handles missing classification (when skipped)', () => {
    const metrics = computeTurnMetrics({
      sttCommitTime: 1000,
      classificationDoneTime: null,
      llmFirstTokenTime: 1300,
      llmDoneTime: 1700,
      ttsStartTime: 1350,
      ttsDoneTime: 2000,
    })

    expect(metrics.sttToClassification).toBeNull()
    expect(metrics.totalTurnTime).toBe(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/telemetry/voice-metrics.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the metrics module**

```typescript
// lib/telemetry/voice-metrics.ts

interface TurnTimestamps {
  sttCommitTime: number
  classificationDoneTime: number | null
  llmFirstTokenTime: number
  llmDoneTime: number
  ttsStartTime: number
  ttsDoneTime: number
}

export interface TurnMetrics {
  sttToClassification: number | null
  classificationToFirstToken: number | null
  llmFirstToken: number
  llmTotal: number
  ttsLatency: number
  totalTurnTime: number
}

export function computeTurnMetrics(ts: TurnTimestamps): TurnMetrics {
  return {
    sttToClassification: ts.classificationDoneTime ? ts.classificationDoneTime - ts.sttCommitTime : null,
    classificationToFirstToken: ts.classificationDoneTime ? ts.llmFirstTokenTime - ts.classificationDoneTime : null,
    llmFirstToken: ts.llmFirstTokenTime - ts.sttCommitTime,
    llmTotal: ts.llmDoneTime - ts.sttCommitTime,
    ttsLatency: ts.ttsDoneTime - ts.ttsStartTime,
    totalTurnTime: ts.ttsDoneTime - ts.sttCommitTime,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/telemetry/voice-metrics.test.ts`
Expected: PASS

- [ ] **Step 5: Update telemetry API route to accept extended metrics**

In `app/api/voice/telemetry/route.ts`:
- Add `turn_metrics` to the allowed event types
- Accept the `TurnMetrics` payload structure

- [ ] **Step 6: Commit**

```bash
git add lib/telemetry/voice-metrics.ts tests/lib/telemetry/voice-metrics.test.ts app/api/voice/telemetry/route.ts
git commit -m "feat(telemetry): add turn latency breakdown metrics"
```

---

### Task 7: Wire metrics collection into TurnManager

**Files:**
- Modify: `lib/voice-module/core/TurnManager.ts`
- Modify: `components/training/SessionPlayer.tsx`

- [ ] **Step 1: Add timestamp collection to TurnManager**

In `TurnManager.handleUserMessage()`:
1. Record `sttCommitTime = Date.now()` at entry
2. Record `classificationDoneTime` after classifier runs (if enabled)
3. Record `llmFirstTokenTime` on first `delta` chunk
4. Record `llmDoneTime` on `done` chunk
5. Record `ttsStartTime` before first `speak()` call
6. Record `ttsDoneTime` after last `speak()` completes
7. Emit a new `metrics` event with the timestamps

- [ ] **Step 2: Send metrics from SessionPlayer**

In SessionPlayer, listen for the `metrics` event from the voice session and POST to `/api/voice/telemetry` with event type `turn_metrics`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/voice-module/core/TurnManager.ts components/training/SessionPlayer.tsx
git commit -m "feat: collect and report turn latency metrics"
```

---

### Task 8: Create voice metrics admin page

**Files:**
- Create: `app/admin/voice-metrics/page.tsx`

- [ ] **Step 1: Write the admin page**

A server component that:
1. Queries `voice_telemetry_events` from Supabase for the last 7 days
2. Computes aggregates: avg turn time, P95 turn time, interrupt rate, fallback rate, error rate
3. Displays as a simple table/card layout

```typescript
// app/admin/voice-metrics/page.tsx
import { createClient } from '@/lib/supabase/server'

export default async function VoiceMetricsPage() {
  const supabase = await createClient()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: events } = await supabase
    .from('voice_telemetry_events')
    .select('event_type, payload, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1000)

  const totalEvents = events?.length ?? 0
  const turnMetrics = events?.filter((e) => e.event_type === 'turn_metrics') ?? []
  const interrupts = events?.filter((e) => e.event_type === 'interrupt') ?? []
  const fallbacks = events?.filter((e) => e.event_type === 'fallback_mode') ?? []
  const errors = events?.filter((e) => e.event_type === 'voice_error') ?? []

  const avgTurnTime = turnMetrics.length > 0
    ? Math.round(turnMetrics.reduce((sum, e) => sum + (e.payload?.totalTurnTime ?? 0), 0) / turnMetrics.length)
    : 0

  const turnTimes = turnMetrics.map((e) => e.payload?.totalTurnTime ?? 0).sort((a, b) => a - b)
  const p95Index = Math.floor(turnTimes.length * 0.95)
  const p95TurnTime = turnTimes[p95Index] ?? 0

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-2xl font-bold">Voice Metrics (Last 7 Days)</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Total Events" value={totalEvents} />
        <MetricCard label="Avg Turn Time" value={`${avgTurnTime}ms`} />
        <MetricCard label="P95 Turn Time" value={`${p95TurnTime}ms`} />
        <MetricCard label="Interrupt Rate" value={`${totalEvents > 0 ? Math.round((interrupts.length / totalEvents) * 100) : 0}%`} />
        <MetricCard label="Fallback Rate" value={`${totalEvents > 0 ? Math.round((fallbacks.length / totalEvents) * 100) : 0}%`} />
        <MetricCard label="Error Rate" value={`${totalEvents > 0 ? Math.round((errors.length / totalEvents) * 100) : 0}%`} />
        <MetricCard label="Turn Metrics" value={turnMetrics.length} />
        <MetricCard label="Errors" value={errors.length} />
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/voice-metrics/page.tsx
git commit -m "feat: add voice metrics admin dashboard"
```

---

### Task 9: Add performance budget assertions to tests

**Files:**
- Create: `tests/lib/voice-module/core/performance-budgets.test.ts`

- [ ] **Step 1: Write performance budget test**

```typescript
// tests/lib/voice-module/core/performance-budgets.test.ts
import { describe, it, expect, vi } from 'vitest'
import { classifyUtterance } from '@/lib/coach/utterance-classifier'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"category":"question","confidence":0.8}' }],
      }),
    },
  })),
}))

describe('Performance budgets', () => {
  it('fast-path classification completes in <5ms', async () => {
    const start = performance.now()
    await classifyUtterance('Pause')
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(5)
  })

  it('fast-path filler detection completes in <5ms', async () => {
    const start = performance.now()
    await classifyUtterance('Ähm')
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(5)
  })

  // Note: LLM-based classification latency depends on API and is tested via telemetry, not unit tests
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/lib/voice-module/core/performance-budgets.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/lib/voice-module/core/performance-budgets.test.ts
git commit -m "test: add performance budget assertions for classification fast path"
```

---

### Task 10: Wire resilience into VoiceSession and final integration

**Files:**
- Modify: `lib/voice-module/core/VoiceSession.ts`
- Modify: `components/training/SessionPlayer.tsx`
- Modify: `lib/voice-module/index.ts`

- [ ] **Step 1: Add SilenceEscalator to VoiceSession**

In `VoiceSession`:
1. Create `SilenceEscalator` in constructor
2. `onNudge`: speak "Alles gut bei dir?" via TTS
3. `onCheck`: speak "Alles ok? Sag Bescheid wenn du Hilfe brauchst."
4. `onPause`: emit `toolCall({ name: 'pause_workout', input: {} })`
5. Reset escalator on every committed transcript or sendMessage call
6. Start escalator when entering `idle` state after a turn

- [ ] **Step 2: Add Debouncer to STT committed transcript handling**

In `VoiceSession`, wrap the committed transcript handler with a `Debouncer(300)` to prevent rapid-fire duplicate messages.

- [ ] **Step 3: Update module index**

Add exports for new utilities: `Debouncer`, `SilenceEscalator`, `shouldRequestRepeat`, `classifyUtterance`, `computeTurnMetrics`.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Manual smoke test**

1. Test rapid speech — verify debounce works
2. Stay silent for 30s — verify nudge
3. Say "Ähm" — verify it's ignored
4. Say "Pause" — verify direct tool execution without LLM delay
5. Check `/admin/voice-metrics` — verify data appears

- [ ] **Step 6: Commit**

```bash
git add lib/voice-module/core/VoiceSession.ts lib/voice-module/index.ts components/training/SessionPlayer.tsx
git commit -m "feat: complete Stage 3 — robustness with classification, resilience, and observability"
```
