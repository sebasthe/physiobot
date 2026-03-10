# Voice V3 Stage 2: Coach Intelligence

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add coaching modes (Performance/Guidance/Safety), per-context model selection, Five Whys motivation engine, structured memory extraction, MemoryResolver read path, and mixed voice+click control via ActionBus.

**Architecture:** The server orchestrator selects coaching mode and model based on exercise phase and user utterance. MemoryResolver assembles a compact `CoachingMemorySnapshot` from Mem0 at session start, cached for the session. Post-session pipeline extracts structured insights via Sonnet. ActionBus extends the voice module's event emitter to coordinate voice tool calls and UI clicks through a single channel.

**Tech Stack:** TypeScript, Claude API (Haiku + Sonnet), Mem0, Vitest

**Branch:** `feature/voice-v3-coach-brain` (create from `main` after Stage 1 is merged)

**Spec:** `docs/superpowers/specs/2026-03-10-voice-v3-staged-design.md` — Stage 2

**Prerequisite:** Stage 1 must be merged to `main`.

---

## Chunk 1: Coach Policy System & Model Selection

### Task 1: Create coach mode types and selection logic

**Files:**
- Create: `lib/coach/types.ts`
- Create: `lib/coach/mode-selector.ts`
- Test: `tests/lib/coach/mode-selector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/coach/mode-selector.test.ts
import { describe, it, expect } from 'vitest'
import { selectCoachMode, getModelForMode } from '@/lib/coach/mode-selector'
import type { CoachMode, ModeContext } from '@/lib/coach/types'

describe('selectCoachMode', () => {
  it('returns Performance during active warmup', () => {
    const ctx: ModeContext = { exercisePhase: 'main', exerciseStatus: 'active', lastUtterance: 'Weiter' }
    expect(selectCoachMode(ctx)).toBe('performance')
  })

  it('returns Guidance during rest (no active exercise)', () => {
    const ctx: ModeContext = { exercisePhase: 'main', exerciseStatus: 'completed', lastUtterance: 'Was mache ich jetzt?' }
    expect(selectCoachMode(ctx)).toBe('guidance')
  })

  it('returns Safety when pain is mentioned', () => {
    const ctx: ModeContext = { exercisePhase: 'main', exerciseStatus: 'active', lastUtterance: 'Das tut weh' }
    expect(selectCoachMode(ctx)).toBe('safety')
  })

  it('returns Safety when user says zu schwer', () => {
    const ctx: ModeContext = { exercisePhase: 'main', exerciseStatus: 'active', lastUtterance: 'Das ist zu schwer für mich' }
    expect(selectCoachMode(ctx)).toBe('safety')
  })

  it('returns Guidance during cooldown', () => {
    const ctx: ModeContext = { exercisePhase: 'cooldown', exerciseStatus: 'active', lastUtterance: 'Ok' }
    expect(selectCoachMode(ctx)).toBe('guidance')
  })
})

describe('getModelForMode', () => {
  it('returns haiku for performance', () => {
    expect(getModelForMode('performance')).toBe('claude-haiku-4-5-20251001')
  })

  it('returns haiku for guidance', () => {
    expect(getModelForMode('guidance')).toBe('claude-haiku-4-5-20251001')
  })

  it('returns sonnet for safety', () => {
    expect(getModelForMode('safety')).toContain('sonnet')
  })

  it('returns sonnet for motivation', () => {
    expect(getModelForMode('motivation')).toContain('sonnet')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/coach/mode-selector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types**

```typescript
// lib/coach/types.ts
export type CoachMode = 'performance' | 'guidance' | 'safety' | 'motivation'

export interface ModeContext {
  exercisePhase: 'warmup' | 'main' | 'cooldown'
  exerciseStatus: 'pending' | 'active' | 'completed' | 'skipped'
  lastUtterance: string
}

export interface CoachingMemorySnapshot {
  kernMotivation: string | null
  personalityPrefs: {
    communicationStyle: string
    encouragementType: string
  } | null
  trainingPatterns: {
    knownPainPoints: string[]
    preferredExercises: string[]
    fatigueSignals: string[]
  } | null
  lifeContext: string[]
  sessionCount: number
}
```

- [ ] **Step 4: Write the mode selector**

```typescript
// lib/coach/mode-selector.ts
import type { CoachMode, ModeContext } from './types'

const SAFETY_KEYWORDS = [
  'tut weh', 'schmerz', 'weh', 'zu schwer', 'kann nicht',
  'aufhören', 'stop', 'hilfe', 'schlecht', 'schwindel',
  'übel', 'kribbel', 'taub',
]

const MODEL_MAP: Record<CoachMode, string> = {
  performance: 'claude-haiku-4-5-20251001',
  guidance: 'claude-haiku-4-5-20251001',
  safety: 'claude-sonnet-4-5-20241022',
  motivation: 'claude-sonnet-4-5-20241022',
}

export function selectCoachMode(ctx: ModeContext): CoachMode {
  const utteranceLower = ctx.lastUtterance.toLowerCase()

  // Safety takes priority — check for pain/distress keywords
  if (SAFETY_KEYWORDS.some((kw) => utteranceLower.includes(kw))) {
    return 'safety'
  }

  // Guidance during rest or cooldown
  if (ctx.exerciseStatus === 'completed' || ctx.exercisePhase === 'cooldown') {
    return 'guidance'
  }

  // Performance during active exercise
  if (ctx.exerciseStatus === 'active') {
    return 'performance'
  }

  return 'guidance'
}

export function getModelForMode(mode: CoachMode): string {
  return MODEL_MAP[mode]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/coach/mode-selector.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/coach/types.ts lib/coach/mode-selector.ts tests/lib/coach/mode-selector.test.ts
git commit -m "feat(coach): add mode selection and model routing"
```

---

### Task 2: Create coach policy prompts per mode

**Files:**
- Create: `lib/coach/policy-prompts.ts`
- Test: `tests/lib/coach/policy-prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/coach/policy-prompts.test.ts
import { describe, it, expect } from 'vitest'
import { buildCoachPolicyPrompt } from '@/lib/coach/policy-prompts'
import type { CoachingMemorySnapshot } from '@/lib/coach/types'

const mockMemory: CoachingMemorySnapshot = {
  kernMotivation: 'Für meine Kinder da sein',
  personalityPrefs: { communicationStyle: 'direkt', encouragementType: 'challenge-driven' },
  trainingPatterns: { knownPainPoints: ['Schulter'], preferredExercises: [], fatigueSignals: [] },
  lifeContext: ['Bürojob'],
  sessionCount: 5,
}

describe('buildCoachPolicyPrompt', () => {
  it('performance mode produces short, punchy instructions', () => {
    const prompt = buildCoachPolicyPrompt('performance', mockMemory)
    expect(prompt).toContain('kurz')
    expect(prompt).toContain('maximal 1-2 Sätze')
  })

  it('guidance mode allows longer responses', () => {
    const prompt = buildCoachPolicyPrompt('guidance', mockMemory)
    expect(prompt).toContain('Technik')
  })

  it('safety mode includes stop instructions', () => {
    const prompt = buildCoachPolicyPrompt('safety', mockMemory)
    expect(prompt).toContain('Sicherheit')
    expect(prompt).toContain('stopp')
  })

  it('motivation mode includes Five Whys', () => {
    const prompt = buildCoachPolicyPrompt('motivation', mockMemory)
    expect(prompt).toContain('Warum')
  })

  it('injects memory context when available', () => {
    const prompt = buildCoachPolicyPrompt('performance', mockMemory)
    expect(prompt).toContain('Für meine Kinder da sein')
  })

  it('handles null memory gracefully', () => {
    const emptyMemory: CoachingMemorySnapshot = {
      kernMotivation: null,
      personalityPrefs: null,
      trainingPatterns: null,
      lifeContext: [],
      sessionCount: 1,
    }
    const prompt = buildCoachPolicyPrompt('performance', emptyMemory)
    expect(prompt).toBeDefined()
    expect(prompt.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/coach/policy-prompts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the policy prompts**

```typescript
// lib/coach/policy-prompts.ts
import type { CoachMode, CoachingMemorySnapshot } from './types'

function buildMemoryBlock(memory: CoachingMemorySnapshot): string {
  const lines: string[] = []

  if (memory.kernMotivation) {
    lines.push(`Kern-Motivation des Nutzers: "${memory.kernMotivation}"`)
  }
  if (memory.personalityPrefs) {
    lines.push(`Kommunikationsstil: ${memory.personalityPrefs.communicationStyle}, Ermutigung: ${memory.personalityPrefs.encouragementType}`)
  }
  if (memory.trainingPatterns) {
    if (memory.trainingPatterns.knownPainPoints.length > 0) {
      lines.push(`Bekannte Schmerzpunkte: ${memory.trainingPatterns.knownPainPoints.join(', ')}`)
    }
    if (memory.trainingPatterns.fatigueSignals.length > 0) {
      lines.push(`Ermüdungssignale: ${memory.trainingPatterns.fatigueSignals.join(', ')}`)
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
- Antworte kurz und knapp, maximal 1-2 Sätze
- Motivierende Anfeuerungen, Zählhilfen, Tempo-Hinweise
- Keine Erklärungen, keine Technik-Tipps während des Satzes
- Energie und Rhythmus in der Stimme`,

  guidance: `Du bist im Guidance-Modus. Der Nutzer ist in einer Pause oder zwischen Übungen.

Regeln:
- Technik-Tipps, Form-Korrekturen, Ermutigung erlaubt
- Erkläre kurz, was als Nächstes kommt
- Beantworte Fragen zur Übungsausführung
- Maximal 3 Sätze pro Antwort`,

  safety: `Du bist im Safety-Modus. Der Nutzer hat Schmerzen oder Probleme gemeldet.

Regeln:
- Sicherheit geht vor — schlage sofort vor, die Übung zu stoppen oder zu pausieren
- Frage nach: Wo genau? Wie stark (1-10)? Seit wann?
- Schlage Alternativen oder Modifikationen vor
- Dränge niemals zum Weitermachen bei Schmerzen
- Du bist kein Arzt — bei ernsten Beschwerden empfiehl den Therapeuten`,

  motivation: `Du bist im Motivations-Modus. Erkunde die tiefere Motivation des Nutzers.

Regeln:
- Nutze die "Five Whys" Methode: Frage sanft "Warum ist dir das wichtig?"
- Gehe schrittweise tiefer, nicht alle Fragen auf einmal
- Sei einfühlsam und wertschätzend
- Wenn der Nutzer seine Kern-Motivation teilt, bestätige sie warmherzig
- Maximal eine Frage pro Antwort`,
}

export function buildCoachPolicyPrompt(mode: CoachMode, memory: CoachingMemorySnapshot): string {
  return POLICY[mode] + buildMemoryBlock(memory)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/coach/policy-prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/coach/policy-prompts.ts tests/lib/coach/policy-prompts.test.ts
git commit -m "feat(coach): add policy prompts per coaching mode"
```

---

### Task 3: Integrate mode selection into server orchestrator

**Files:**
- Modify: `lib/voice/server-orchestrator.ts`
- Modify: `app/api/voice/realtime/stream/route.ts`

- [ ] **Step 1: Update server orchestrator to accept mode and use model routing**

In `lib/voice/server-orchestrator.ts`:
1. Import `selectCoachMode`, `getModelForMode` from `@/lib/coach/mode-selector`
2. Import `buildCoachPolicyPrompt` from `@/lib/coach/policy-prompts`
3. Add `modeContext` and `memorySnapshot` parameters to both orchestration functions
4. Call `selectCoachMode(modeContext)` to determine mode
5. Call `getModelForMode(mode)` to pick model
6. Call `buildCoachPolicyPrompt(mode, memorySnapshot)` to build the system prompt
7. Pass the selected model to the Claude API call

- [ ] **Step 2: Update SSE stream route to pass mode context**

In `app/api/voice/realtime/stream/route.ts`:
1. Accept `exercisePhase`, `exerciseStatus` in POST body
2. Construct `ModeContext` from request data
3. Pass to `streamVoiceTurnOrchestration()`

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/voice/server-orchestrator.ts app/api/voice/realtime/stream/route.ts
git commit -m "feat: integrate coach mode selection and model routing into server orchestrator"
```

---

## Chunk 2: Memory System

### Task 4: Create MemoryResolver

**Files:**
- Create: `lib/memory/resolver.ts`
- Test: `tests/lib/memory/resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/memory/resolver.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryResolver } from '@/lib/memory/resolver'
import type { CoachingMemorySnapshot } from '@/lib/coach/types'

// Mock Mem0
vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockImplementation((query: string) => {
      if (query.includes('Motivation')) {
        return Promise.resolve([{ memory: 'Kern-Motivation: Für meine Kinder da sein' }])
      }
      if (query.includes('Persönlichkeit')) {
        return Promise.resolve([{ memory: 'Kommunikationsstil: direkt, mag Herausforderungen' }])
      }
      if (query.includes('Training')) {
        return Promise.resolve([{ memory: 'Schulter-Probleme bei Überkopf-Übungen' }])
      }
      if (query.includes('Leben')) {
        return Promise.resolve([{ memory: 'Arbeitet im Büro, 2 Kinder' }])
      }
      return Promise.resolve([])
    }),
  })),
}))

describe('MemoryResolver', () => {
  let resolver: MemoryResolver

  beforeEach(() => {
    resolver = new MemoryResolver()
  })

  it('assembles a CoachingMemorySnapshot from Mem0', async () => {
    const snapshot = await resolver.getSessionSnapshot('user-123', 5)
    expect(snapshot).toBeDefined()
    expect(snapshot.sessionCount).toBe(5)
  })

  it('returns null fields when no memories found', async () => {
    vi.doMock('mem0ai', () => ({
      default: vi.fn().mockImplementation(() => ({
        search: vi.fn().mockResolvedValue([]),
      })),
    }))

    const emptyResolver = new MemoryResolver()
    const snapshot = await emptyResolver.getSessionSnapshot('user-empty', 1)
    expect(snapshot.sessionCount).toBe(1)
  })

  it('caches snapshot for the same user', async () => {
    const snap1 = await resolver.getSessionSnapshot('user-123', 5)
    const snap2 = await resolver.getSessionSnapshot('user-123', 5)
    // Should be the same object reference (cached)
    expect(snap1).toBe(snap2)
  })

  it('invalidates cache for different user', async () => {
    const snap1 = await resolver.getSessionSnapshot('user-123', 5)
    const snap2 = await resolver.getSessionSnapshot('user-456', 3)
    expect(snap1).not.toBe(snap2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/memory/resolver.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the MemoryResolver**

```typescript
// lib/memory/resolver.ts
import type { CoachingMemorySnapshot } from '@/lib/coach/types'
import MemoryClient from 'mem0ai'

const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY ?? '' })

export class MemoryResolver {
  private cache: Map<string, CoachingMemorySnapshot> = new Map()

  async getSessionSnapshot(userId: string, sessionCount: number): Promise<CoachingMemorySnapshot> {
    const cached = this.cache.get(userId)
    if (cached) return cached

    const [motivationResults, personalityResults, trainingResults, lifeResults] = await Promise.all([
      client.search('Kern-Motivation und Warum des Trainings', { user_id: userId, limit: 3 }).catch(() => []),
      client.search('Persönlichkeit und Kommunikationsstil', { user_id: userId, limit: 3 }).catch(() => []),
      client.search('Trainingsmuster, Schmerzpunkte und Ermüdung', { user_id: userId, limit: 3 }).catch(() => []),
      client.search('Lebenskontext, Beruf, Familie', { user_id: userId, limit: 3 }).catch(() => []),
    ])

    const snapshot: CoachingMemorySnapshot = {
      kernMotivation: this.extractFirst(motivationResults),
      personalityPrefs: this.parsePersonality(personalityResults),
      trainingPatterns: this.parseTraining(trainingResults),
      lifeContext: this.extractAll(lifeResults),
      sessionCount,
    }

    this.cache.set(userId, snapshot)
    return snapshot
  }

  clearCache(userId?: string): void {
    if (userId) {
      this.cache.delete(userId)
    } else {
      this.cache.clear()
    }
  }

  private extractFirst(results: Array<{ memory?: string }>): string | null {
    return results[0]?.memory ?? null
  }

  private extractAll(results: Array<{ memory?: string }>): string[] {
    return results.filter((r) => r.memory).map((r) => r.memory!)
  }

  private parsePersonality(results: Array<{ memory?: string }>): CoachingMemorySnapshot['personalityPrefs'] {
    if (results.length === 0) return null
    const text = results.map((r) => r.memory).join(' ')
    return {
      communicationStyle: text.includes('direkt') ? 'direkt' : 'einfühlsam',
      encouragementType: text.includes('Herausforderung') ? 'challenge-driven' : 'supportive',
    }
  }

  private parseTraining(results: Array<{ memory?: string }>): CoachingMemorySnapshot['trainingPatterns'] {
    if (results.length === 0) return null
    const allText = results.map((r) => r.memory ?? '').join(' ')
    return {
      knownPainPoints: this.extractKeywords(allText, ['Schulter', 'Knie', 'Rücken', 'Nacken', 'Hüfte']),
      preferredExercises: [],
      fatigueSignals: this.extractKeywords(allText, ['einsilbig', 'atmet schwer', 'langsamer']),
    }
  }

  private extractKeywords(text: string, keywords: string[]): string[] {
    return keywords.filter((kw) => text.toLowerCase().includes(kw.toLowerCase()))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/memory/resolver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/memory/resolver.ts tests/lib/memory/resolver.test.ts
git commit -m "feat(memory): add MemoryResolver for coaching context assembly"
```

---

### Task 5: Create post-session memory extraction pipeline

**Files:**
- Create: `lib/memory/extractor.ts`
- Test: `tests/lib/memory/extractor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/memory/extractor.test.ts
import { describe, it, expect, vi } from 'vitest'
import { extractSessionInsights } from '@/lib/memory/extractor'

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            motivation_hints: ['Will für Kinder fit bleiben'],
            personality_preferences: { communicationStyle: 'direkt', encouragementType: 'challenge-driven' },
            training_patterns: { knownPainPoints: ['Schulter'], preferredExercises: ['Squats'], fatigueSignals: ['wird stiller'] },
            life_context: ['Bürojob', '2 Kinder'],
          }),
        }],
      }),
    },
  })),
}))

// Mock Mem0
vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'mem-1' }),
  })),
}))

describe('extractSessionInsights', () => {
  it('extracts structured insights from a transcript', async () => {
    const transcript = [
      { role: 'user', content: 'Ich mache das für meine Kinder' },
      { role: 'assistant', content: 'Das ist eine tolle Motivation!' },
    ]

    const insights = await extractSessionInsights('user-123', transcript)
    expect(insights.motivation_hints).toContain('Will für Kinder fit bleiben')
    expect(insights.training_patterns.knownPainPoints).toContain('Schulter')
  })

  it('stores insights to Mem0', async () => {
    const transcript = [
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Ok' },
    ]

    await extractSessionInsights('user-123', transcript)
    // Verify Mem0 add was called (via mock)
    const MemoryClient = (await import('mem0ai')).default
    const instance = new MemoryClient()
    expect(instance.add).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/memory/extractor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the memory extractor**

```typescript
// lib/memory/extractor.ts
import Anthropic from '@anthropic-ai/sdk'
import MemoryClient from 'mem0ai'

const anthropic = new Anthropic()
const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY ?? '' })

interface ExtractedInsights {
  motivation_hints: string[]
  personality_preferences: { communicationStyle: string; encouragementType: string }
  training_patterns: { knownPainPoints: string[]; preferredExercises: string[]; fatigueSignals: string[] }
  life_context: string[]
}

const EXTRACTION_PROMPT = `Analysiere das folgende Trainingsgespräch und extrahiere strukturierte Erkenntnisse.

Antworte NUR mit einem JSON-Objekt in diesem Format:
{
  "motivation_hints": ["..."],
  "personality_preferences": { "communicationStyle": "direkt|einfühlsam", "encouragementType": "challenge-driven|supportive" },
  "training_patterns": { "knownPainPoints": ["..."], "preferredExercises": ["..."], "fatigueSignals": ["..."] },
  "life_context": ["..."]
}

Regeln:
- Nur stabile, wiederkehrende Muster extrahieren (nicht flüchtige Aussagen)
- Leere Arrays wenn keine Erkenntnisse
- Keine Vermutungen — nur was explizit gesagt wurde`

export async function extractSessionInsights(
  userId: string,
  transcript: Array<{ role: string; content: string }>,
): Promise<ExtractedInsights> {
  const conversationText = transcript
    .map((m) => `${m.role === 'user' ? 'Nutzer' : 'Coach'}: ${m.content}`)
    .join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    system: EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: conversationText }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
  const insights: ExtractedInsights = JSON.parse(text)

  // Store high-value insights to Mem0
  const memoryEntries: string[] = []

  if (insights.motivation_hints.length > 0) {
    memoryEntries.push(`Motivation: ${insights.motivation_hints.join(', ')}`)
  }
  if (insights.training_patterns.knownPainPoints.length > 0) {
    memoryEntries.push(`Schmerzpunkte: ${insights.training_patterns.knownPainPoints.join(', ')}`)
  }
  if (insights.life_context.length > 0) {
    memoryEntries.push(`Lebenskontext: ${insights.life_context.join(', ')}`)
  }

  for (const entry of memoryEntries) {
    await mem0.add(entry, { user_id: userId, metadata: { source: 'session_extraction' } }).catch(() => {})
  }

  return insights
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/memory/extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/memory/extractor.ts tests/lib/memory/extractor.test.ts
git commit -m "feat(memory): add post-session insight extraction pipeline"
```

---

### Task 6: Integrate MemoryResolver into server orchestrator

**Files:**
- Modify: `lib/voice/server-orchestrator.ts`
- Modify: `app/api/voice/realtime/stream/route.ts`

- [ ] **Step 1: Update server orchestrator**

1. Import `MemoryResolver` from `@/lib/memory/resolver`
2. Create a module-level `MemoryResolver` instance
3. In `streamVoiceTurnOrchestration()`: call `resolver.getSessionSnapshot(userId, sessionNumber)` to get the memory snapshot
4. Pass snapshot to `buildCoachPolicyPrompt()` instead of raw Mem0 queries
5. Remove the existing direct Mem0 calls from `buildVoiceOrchestrationPrompt()`

- [ ] **Step 2: Update SSE stream route to pass sessionNumber**

Ensure `sessionNumber` is passed from the client through the POST body to the orchestrator.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/voice/server-orchestrator.ts app/api/voice/realtime/stream/route.ts
git commit -m "feat: integrate MemoryResolver into server orchestrator"
```

---

## Chunk 3: Motivation Engine & Mixed Control

### Task 7: Add Five Whys motivation probing to coach policy

**Files:**
- Modify: `lib/coach/mode-selector.ts`
- Modify: `lib/coach/policy-prompts.ts`
- Test: `tests/lib/coach/motivation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/coach/motivation.test.ts
import { describe, it, expect } from 'vitest'
import { shouldProbeMotivation } from '@/lib/coach/mode-selector'
import { buildCoachPolicyPrompt } from '@/lib/coach/policy-prompts'
import type { CoachingMemorySnapshot } from '@/lib/coach/types'

describe('shouldProbeMotivation', () => {
  it('returns true in early sessions during rest', () => {
    expect(shouldProbeMotivation({ sessionCount: 1, exerciseStatus: 'completed', kernMotivation: null })).toBe(true)
    expect(shouldProbeMotivation({ sessionCount: 3, exerciseStatus: 'completed', kernMotivation: null })).toBe(true)
  })

  it('returns false after session 3', () => {
    expect(shouldProbeMotivation({ sessionCount: 4, exerciseStatus: 'completed', kernMotivation: null })).toBe(false)
  })

  it('returns false during active exercise', () => {
    expect(shouldProbeMotivation({ sessionCount: 1, exerciseStatus: 'active', kernMotivation: null })).toBe(false)
  })

  it('returns false if kern motivation already discovered', () => {
    expect(shouldProbeMotivation({ sessionCount: 2, exerciseStatus: 'completed', kernMotivation: 'Für meine Kinder' })).toBe(false)
  })
})

describe('motivation drop detection in policy', () => {
  it('safety prompt includes motivation reference on low energy', () => {
    const memory: CoachingMemorySnapshot = {
      kernMotivation: 'Für meine Kinder da sein',
      personalityPrefs: null,
      trainingPatterns: null,
      lifeContext: [],
      sessionCount: 5,
    }
    const prompt = buildCoachPolicyPrompt('safety', memory)
    expect(prompt).toContain('Für meine Kinder da sein')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/coach/motivation.test.ts`
Expected: FAIL — `shouldProbeMotivation` not found

- [ ] **Step 3: Add motivation probing logic**

Add to `lib/coach/mode-selector.ts`:

```typescript
interface MotivationContext {
  sessionCount: number
  exerciseStatus: 'pending' | 'active' | 'completed' | 'skipped'
  kernMotivation: string | null
}

export function shouldProbeMotivation(ctx: MotivationContext): boolean {
  // Only in sessions 1-3, during rest, and when motivation not yet found
  return ctx.sessionCount <= 3
    && ctx.exerciseStatus === 'completed'
    && !ctx.kernMotivation
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/coach/motivation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/coach/mode-selector.ts lib/coach/policy-prompts.ts tests/lib/coach/motivation.test.ts
git commit -m "feat(coach): add Five Whys motivation probing logic"
```

---

### Task 8: Wire motivation detection into server orchestrator

**Files:**
- Modify: `lib/voice/server-orchestrator.ts`

- [ ] **Step 1: Update orchestrator to check motivation probing**

In `streamVoiceTurnOrchestration()`:
1. After getting `memorySnapshot` and `modeContext`, check `shouldProbeMotivation()`
2. If true, override mode to `'motivation'` (which uses Sonnet and Five Whys prompt)
3. The coaching prompt automatically includes motivation-specific instructions

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/voice/server-orchestrator.ts
git commit -m "feat: wire motivation probing into server orchestrator turn flow"
```

---

### Task 9: Integrate memory extraction into feedback flow

**Files:**
- Modify: `app/api/feedback/route.ts`

- [ ] **Step 1: Add extraction call after feedback submission**

In the existing feedback route:
1. Import `extractSessionInsights` from `@/lib/memory/extractor`
2. After saving feedback to Supabase, retrieve the session transcript from the request
3. Call `extractSessionInsights(userId, transcript)` asynchronously (fire-and-forget)
4. Do not block the feedback response on extraction

- [ ] **Step 2: Update SessionPlayer/feedback page to send transcript**

Ensure the transcript stored in `sessionStorage` is sent along with the feedback POST.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/feedback/route.ts app/training/feedback/page.tsx
git commit -m "feat: run memory extraction pipeline after session feedback"
```

---

### Task 10: Add ActionBus for mixed voice+click control

**Files:**
- Create: `lib/voice-module/core/ActionBus.ts`
- Test: `tests/lib/voice-module/core/ActionBus.test.ts`
- Modify: `components/training/SessionPlayer.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/core/ActionBus.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ActionBus } from '@/lib/voice-module/core/ActionBus'

describe('ActionBus', () => {
  it('dispatches voice actions', () => {
    const bus = new ActionBus()
    const handler = vi.fn()
    bus.on(handler)
    bus.dispatch({ source: 'voice', action: 'next_exercise', payload: {} })
    expect(handler).toHaveBeenCalledWith({ source: 'voice', action: 'next_exercise', payload: {} })
  })

  it('dispatches UI actions', () => {
    const bus = new ActionBus()
    const handler = vi.fn()
    bus.on(handler)
    bus.dispatch({ source: 'ui', action: 'next_exercise', payload: {} })
    expect(handler).toHaveBeenCalledWith({ source: 'ui', action: 'next_exercise', payload: {} })
  })

  it('off removes handler', () => {
    const bus = new ActionBus()
    const handler = vi.fn()
    bus.on(handler)
    bus.off(handler)
    bus.dispatch({ source: 'ui', action: 'pause_workout', payload: {} })
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/core/ActionBus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the ActionBus**

```typescript
// lib/voice-module/core/ActionBus.ts
export interface BusAction {
  source: 'voice' | 'ui'
  action: string
  payload: Record<string, unknown>
}

type ActionHandler = (action: BusAction) => void

export class ActionBus {
  private handlers = new Set<ActionHandler>()

  on(handler: ActionHandler): void {
    this.handlers.add(handler)
  }

  off(handler: ActionHandler): void {
    this.handlers.delete(handler)
  }

  dispatch(action: BusAction): void {
    for (const handler of this.handlers) {
      handler(action)
    }
  }

  destroy(): void {
    this.handlers.clear()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/core/ActionBus.test.ts`
Expected: PASS

- [ ] **Step 5: Wire ActionBus into SessionPlayer**

In `components/training/SessionPlayer.tsx`:
1. Create an `ActionBus` instance
2. On `toolCall` from `useVoiceSession`: dispatch `{ source: 'voice', action: tool.name, payload: tool.input }`
3. On UI button clicks (next, pause, etc.): dispatch `{ source: 'ui', action, payload: {} }`
4. Subscribe to the bus with a single handler that validates and executes against `WorkoutState`

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/voice-module/core/ActionBus.ts tests/lib/voice-module/core/ActionBus.test.ts components/training/SessionPlayer.tsx lib/voice-module/index.ts
git commit -m "feat(voice-module): add ActionBus for mixed voice+click control"
```

---

### Task 11: Final integration — update module index and run all tests

**Files:**
- Modify: `lib/voice-module/index.ts` (add ActionBus export)

- [ ] **Step 1: Update module index**

Add `export { ActionBus, type BusAction } from './core/ActionBus'` to `lib/voice-module/index.ts`.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Manual smoke test**

1. Start dev server
2. Begin a training session
3. Verify coach mode changes (short cues during sets, longer during rest)
4. Verify motivation probing in early sessions
5. Click "next" button while coach is talking — verify coach acknowledges
6. Say "Nächste Übung" — verify same result as clicking

- [ ] **Step 4: Commit**

```bash
git add lib/voice-module/index.ts
git commit -m "feat: complete Stage 2 — coach intelligence with modes, memory, and mixed control"
```
