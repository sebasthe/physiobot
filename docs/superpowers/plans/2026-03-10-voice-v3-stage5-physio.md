# Voice V3 Stage 5: Physio/Medical Expansion

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sensitivity-aware content routing, medical domain model (PhysioContext), pain tracking, session abort on high pain, audit logging for Class D data, and consent upgrade for physio mode.

**Architecture:** A sensitivity router classifies each turn for medical content and escalates to Safety mode + Sonnet when detected. The PhysioContext extends TurnContext with therapist-provided constraints (contraindications, modifications) that the coach treats as hard boundaries. Pain tracking is structured (location, intensity, type) and stored as Class D. The `canExecuteTool` hook from Stage 4 gains real restrictions based on sensitivity level. An audit log tracks every Class D data access.

**Tech Stack:** TypeScript, Claude Sonnet (sensitivity routing), Supabase (audit log, pain log), Mem0, Vitest

**Branch:** `feature/voice-v3-physio` (create from `main` after Stage 4 is merged)

**Spec:** `docs/superpowers/specs/2026-03-10-voice-v3-staged-design.md` — Stage 5

**Prerequisite:** Stage 4 must be merged to `main`.

---

## Chunk 1: Sensitivity Router & PhysioContext

### Task 1: Create sensitivity router

**Files:**
- Create: `lib/physio/sensitivity-router.ts`
- Test: `tests/lib/physio/sensitivity-router.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/physio/sensitivity-router.test.ts
import { describe, it, expect } from 'vitest'
import { classifySensitivity, type SensitivityLevel } from '@/lib/physio/sensitivity-router'

describe('classifySensitivity', () => {
  it('returns normal for regular exercise talk', () => {
    expect(classifySensitivity('Nächste Übung bitte').level).toBe('normal')
  })

  it('returns elevated for general pain mention', () => {
    const result = classifySensitivity('Das tut ein bisschen weh')
    expect(result.level).toBe('elevated')
  })

  it('returns high for specific pain with duration', () => {
    const result = classifySensitivity('Stechender Schmerz im rechten Knie seit 2 Wochen')
    expect(result.level).toBe('high')
  })

  it('returns high for diagnosis mention', () => {
    const result = classifySensitivity('Mein Arzt hat Bandscheibenvorfall diagnostiziert')
    expect(result.level).toBe('high')
  })

  it('returns elevated for medication reference', () => {
    const result = classifySensitivity('Ich nehme Ibuprofen gegen die Schmerzen')
    expect(result.level).toBe('elevated')
  })

  it('includes detected signals', () => {
    const result = classifySensitivity('Stechender Schmerz im Knie')
    expect(result.signals.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/physio/sensitivity-router.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the sensitivity router**

```typescript
// lib/physio/sensitivity-router.ts

export type SensitivityLevel = 'normal' | 'elevated' | 'high'

export interface SensitivityResult {
  level: SensitivityLevel
  signals: string[]
}

interface Pattern {
  pattern: RegExp
  level: SensitivityLevel
  signal: string
}

const PATTERNS: Pattern[] = [
  // High — specific medical content
  { pattern: /diagnos/i, signal: 'diagnosis_mention', level: 'high' },
  { pattern: /bandscheib/i, signal: 'spinal_condition', level: 'high' },
  { pattern: /arthr(ose|itis)/i, signal: 'joint_condition', level: 'high' },
  { pattern: /operati(on|ert)/i, signal: 'surgery_mention', level: 'high' },
  { pattern: /reha\b/i, signal: 'rehab_mention', level: 'high' },
  { pattern: /befund/i, signal: 'medical_finding', level: 'high' },
  { pattern: /(stechend|ziehend|brennend|ausstrahlend).{0,20}(schmerz|weh)/i, signal: 'specific_pain', level: 'high' },
  { pattern: /seit\s+\d+\s+(tag|woch|monat)/i, signal: 'chronic_duration', level: 'high' },

  // Elevated — general health concerns
  { pattern: /medikament|ibuprofen|voltaren|tablette/i, signal: 'medication_mention', level: 'elevated' },
  { pattern: /(tut|ist).{0,10}weh/i, signal: 'pain_general', level: 'elevated' },
  { pattern: /schmerz/i, signal: 'pain_word', level: 'elevated' },
  { pattern: /schwindel|übel|kribbel|taub/i, signal: 'neurological_symptom', level: 'elevated' },
  { pattern: /blutdruck|herzrasen|atemnot/i, signal: 'cardiovascular_symptom', level: 'elevated' },
]

export function classifySensitivity(text: string): SensitivityResult {
  const signals: string[] = []
  let maxLevel: SensitivityLevel = 'normal'

  for (const { pattern, level, signal } of PATTERNS) {
    if (pattern.test(text)) {
      signals.push(signal)
      if (level === 'high') maxLevel = 'high'
      else if (level === 'elevated' && maxLevel === 'normal') maxLevel = 'elevated'
    }
  }

  return { level: maxLevel, signals }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/physio/sensitivity-router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/physio/sensitivity-router.ts tests/lib/physio/sensitivity-router.test.ts
git commit -m "feat(physio): add sensitivity content router"
```

---

### Task 2: Create PhysioContext type and loader

**Files:**
- Create: `lib/physio/types.ts`
- Create: `lib/physio/context-loader.ts`
- Test: `tests/lib/physio/context-loader.test.ts`

- [ ] **Step 1: Write the types**

```typescript
// lib/physio/types.ts
import type { TurnContext } from '@/lib/voice-module/core/types'

export interface PainEntry {
  location: string
  intensity: number   // 1-10
  type: string        // stechend, ziehend, dumpf, brennend
  exerciseId: string
  timestamp: string
}

export interface PhysioContext extends TurnContext {
  contraindications: string[]
  painLog: PainEntry[]
  mobilityBaseline: Record<string, number>
  therapistNotes: string | null
  exerciseModifications: Record<string, string>
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/lib/physio/context-loader.test.ts
import { describe, it, expect, vi } from 'vitest'
import { loadPhysioContext } from '@/lib/physio/context-loader'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              contraindications: ['Kein Überkopf bei Schulterimpingement'],
              therapist_notes: 'Vorsicht bei Rotationsübungen',
              exercise_modifications: { 'overhead-press': 'Lateral raise stattdessen' },
              mobility_baseline: { shoulder_flexion: 120, knee_extension: 170 },
            },
          }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                { location: 'Knie rechts', intensity: 4, type: 'ziehend', exercise_id: 'ex1', created_at: '2026-03-10' },
              ],
            }),
          }),
        }),
      }),
    }),
  }),
}))

describe('loadPhysioContext', () => {
  it('loads contraindications from plan', async () => {
    const ctx = await loadPhysioContext('user-123', 'plan-456')
    expect(ctx.contraindications).toContain('Kein Überkopf bei Schulterimpingement')
  })

  it('loads therapist notes', async () => {
    const ctx = await loadPhysioContext('user-123', 'plan-456')
    expect(ctx.therapistNotes).toContain('Rotationsübungen')
  })

  it('loads recent pain log', async () => {
    const ctx = await loadPhysioContext('user-123', 'plan-456')
    expect(ctx.painLog).toHaveLength(1)
    expect(ctx.painLog[0].location).toBe('Knie rechts')
  })

  it('loads exercise modifications', async () => {
    const ctx = await loadPhysioContext('user-123', 'plan-456')
    expect(ctx.exerciseModifications['overhead-press']).toBeDefined()
  })
})
```

- [ ] **Step 3: Write the context loader**

```typescript
// lib/physio/context-loader.ts
import { createClient } from '@/lib/supabase/server'
import type { PhysioContext, PainEntry } from './types'

export async function loadPhysioContext(userId: string, planId: string): Promise<Omit<PhysioContext, 'systemPrompt' | 'tools' | 'metadata'>> {
  const supabase = await createClient()

  // Load plan-level physio data
  const { data: plan } = await supabase
    .from('training_plans')
    .select('contraindications, therapist_notes, exercise_modifications, mobility_baseline')
    .eq('id', planId)
    .single()

  // Load recent pain log (last 10 entries)
  const { data: painEntries } = await supabase
    .from('pain_log')
    .select('location, intensity, type, exercise_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  const painLog: PainEntry[] = (painEntries ?? []).map((e) => ({
    location: e.location,
    intensity: e.intensity,
    type: e.type,
    exerciseId: e.exercise_id,
    timestamp: e.created_at,
  }))

  return {
    contraindications: plan?.contraindications ?? [],
    painLog,
    mobilityBaseline: plan?.mobility_baseline ?? {},
    therapistNotes: plan?.therapist_notes ?? null,
    exerciseModifications: plan?.exercise_modifications ?? {},
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/physio/context-loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/physio/types.ts lib/physio/context-loader.ts tests/lib/physio/context-loader.test.ts
git commit -m "feat(physio): add PhysioContext types and context loader"
```

---

## Chunk 2: Pain Tracking & Session Abort

### Task 3: Create pain tracking module

**Files:**
- Create: `lib/physio/pain-tracker.ts`
- Test: `tests/lib/physio/pain-tracker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/physio/pain-tracker.test.ts
import { describe, it, expect, vi } from 'vitest'
import { parsePainReport, shouldAbortSession } from '@/lib/physio/pain-tracker'
import type { PainEntry } from '@/lib/physio/types'

describe('parsePainReport', () => {
  it('extracts pain from structured coach response', () => {
    const report = parsePainReport({
      location: 'Knie rechts',
      intensity: 6,
      type: 'stechend',
    }, 'ex1')

    expect(report.location).toBe('Knie rechts')
    expect(report.intensity).toBe(6)
    expect(report.type).toBe('stechend')
    expect(report.exerciseId).toBe('ex1')
    expect(report.timestamp).toBeDefined()
  })

  it('clamps intensity to 1-10', () => {
    const report = parsePainReport({ location: 'Knie', intensity: 15, type: 'dumpf' }, 'ex1')
    expect(report.intensity).toBe(10)

    const report2 = parsePainReport({ location: 'Knie', intensity: -1, type: 'dumpf' }, 'ex1')
    expect(report2.intensity).toBe(1)
  })
})

describe('shouldAbortSession', () => {
  it('returns true when pain intensity > 7', () => {
    const entry: PainEntry = { location: 'Knie', intensity: 8, type: 'stechend', exerciseId: 'ex1', timestamp: new Date().toISOString() }
    expect(shouldAbortSession(entry)).toBe(true)
  })

  it('returns false when pain intensity <= 7', () => {
    const entry: PainEntry = { location: 'Knie', intensity: 5, type: 'ziehend', exerciseId: 'ex1', timestamp: new Date().toISOString() }
    expect(shouldAbortSession(entry)).toBe(false)
  })

  it('returns true at exactly 8', () => {
    const entry: PainEntry = { location: 'Rücken', intensity: 8, type: 'dumpf', exerciseId: 'ex2', timestamp: new Date().toISOString() }
    expect(shouldAbortSession(entry)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/physio/pain-tracker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the pain tracker**

```typescript
// lib/physio/pain-tracker.ts
import type { PainEntry } from './types'

interface PainReportInput {
  location: string
  intensity: number
  type: string
}

const ABORT_THRESHOLD = 8

export function parsePainReport(input: PainReportInput, exerciseId: string): PainEntry {
  return {
    location: input.location,
    intensity: Math.max(1, Math.min(10, Math.round(input.intensity))),
    type: input.type,
    exerciseId,
    timestamp: new Date().toISOString(),
  }
}

export function shouldAbortSession(entry: PainEntry): boolean {
  return entry.intensity >= ABORT_THRESHOLD
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/physio/pain-tracker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/physio/pain-tracker.ts tests/lib/physio/pain-tracker.test.ts
git commit -m "feat(physio): add pain tracking and session abort logic"
```

---

### Task 4: Create pain log API and database migration

**Files:**
- Create: `supabase/migrations/add_pain_log.sql`
- Create: `app/api/physio/pain/route.ts`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/add_pain_log.sql
CREATE TABLE IF NOT EXISTS pain_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  exercise_id TEXT NOT NULL,
  location TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE pain_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own pain log"
  ON pain_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pain log"
  ON pain_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Write the pain log endpoint**

```typescript
// app/api/physio/pain/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePainReport, shouldAbortSession } from '@/lib/physio/pain-tracker'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { location, intensity, type, exerciseId, sessionId } = body

  const entry = parsePainReport({ location, intensity, type }, exerciseId)
  const abort = shouldAbortSession(entry)

  // Store as Class D
  const { error } = await supabase.from('pain_log').insert({
    user_id: user.id,
    session_id: sessionId,
    exercise_id: entry.exerciseId,
    location: entry.location,
    intensity: entry.intensity,
    type: entry.type,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log for Class D access
  await supabase.from('voice_telemetry_events').insert({
    user_id: user.id,
    session_id: sessionId,
    event_type: 'class_d_write',
    payload: { table: 'pain_log', action: 'insert', data_class: 'D' },
  })

  return NextResponse.json({ stored: true, shouldAbort: abort })
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/add_pain_log.sql app/api/physio/pain/route.ts
git commit -m "feat(physio): add pain log table, API, and audit logging"
```

---

### Task 5: Add pain tracking tool to coach

**Files:**
- Modify: `lib/voice-module/tools/workout-tools.ts`
- Test: `tests/lib/voice-module/tools/pain-tool.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/tools/pain-tool.test.ts
import { describe, it, expect } from 'vitest'
import { WORKOUT_TOOLS } from '@/lib/voice-module/tools/workout-tools'

describe('pain reporting tool', () => {
  it('includes log_pain tool', () => {
    const painTool = WORKOUT_TOOLS.find((t) => t.name === 'log_pain')
    expect(painTool).toBeDefined()
    expect(painTool!.input_schema).toHaveProperty('properties')
  })
})
```

- [ ] **Step 2: Add log_pain tool**

Add to `WORKOUT_TOOLS` in `lib/voice-module/tools/workout-tools.ts`:

```typescript
{
  name: 'log_pain',
  description: 'Log a pain report from the user during exercise. Use when user reports pain.',
  input_schema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'Body location of pain (e.g., Knie rechts, Schulter links)' },
      intensity: { type: 'number', description: 'Pain intensity 1-10' },
      type: { type: 'string', description: 'Pain type: stechend, ziehend, dumpf, brennend' },
    },
    required: ['location', 'intensity', 'type'],
  },
}
```

- [ ] **Step 3: Add validation for log_pain in validateToolCall**

`log_pain` is always valid during an active session — no state constraints.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/lib/voice-module/tools/pain-tool.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/tools/workout-tools.ts tests/lib/voice-module/tools/pain-tool.test.ts
git commit -m "feat(physio): add log_pain tool for structured pain tracking"
```

---

## Chunk 3: Physio Coach Policy & Tool Gating

### Task 6: Create physio-specific coach policy

**Files:**
- Create: `lib/physio/coach-policy.ts`
- Test: `tests/lib/physio/coach-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/physio/coach-policy.test.ts
import { describe, it, expect } from 'vitest'
import { buildPhysioPolicyPrompt } from '@/lib/physio/coach-policy'
import type { PhysioContext } from '@/lib/physio/types'

const mockPhysioCtx: Omit<PhysioContext, 'systemPrompt' | 'tools' | 'metadata'> = {
  contraindications: ['Kein Überkopf bei Schulterimpingement'],
  painLog: [{ location: 'Schulter rechts', intensity: 4, type: 'ziehend', exerciseId: 'ex1', timestamp: '2026-03-10' }],
  mobilityBaseline: { shoulder_flexion: 120 },
  therapistNotes: 'Vorsicht bei Rotationsübungen',
  exerciseModifications: { 'overhead-press': 'Lateral raise stattdessen' },
}

describe('buildPhysioPolicyPrompt', () => {
  it('includes contraindications as hard boundaries', () => {
    const prompt = buildPhysioPolicyPrompt(mockPhysioCtx)
    expect(prompt).toContain('Schulterimpingement')
    expect(prompt).toContain('NIEMALS')
  })

  it('includes therapist notes', () => {
    const prompt = buildPhysioPolicyPrompt(mockPhysioCtx)
    expect(prompt).toContain('Rotationsübungen')
  })

  it('includes pain history', () => {
    const prompt = buildPhysioPolicyPrompt(mockPhysioCtx)
    expect(prompt).toContain('Schulter rechts')
  })

  it('includes never-diagnose rule', () => {
    const prompt = buildPhysioPolicyPrompt(mockPhysioCtx)
    expect(prompt).toContain('kein Arzt')
  })

  it('includes exercise modifications', () => {
    const prompt = buildPhysioPolicyPrompt(mockPhysioCtx)
    expect(prompt).toContain('Lateral raise')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/physio/coach-policy.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the physio policy**

```typescript
// lib/physio/coach-policy.ts
import type { PhysioContext, PainEntry } from './types'

export function buildPhysioPolicyPrompt(
  ctx: Omit<PhysioContext, 'systemPrompt' | 'tools' | 'metadata'>,
): string {
  const sections: string[] = []

  sections.push(`## Physio-Modus — Sicherheitsregeln

Du begleitest eine physiotherapeutische Übung. Der Plan wurde von einem Therapeuten erstellt.

Grundregeln:
- Du bist kein Arzt und stellst NIEMALS Diagnosen
- Du weichst NIEMALS vom Therapieplan ab
- Bei Schmerzintensität ≥8 stoppst du sofort die Übung
- Bei ernsten Beschwerden empfiehlst du den Kontakt zum Therapeuten
- Nutze das log_pain Tool wenn der Nutzer Schmerzen beschreibt`)

  if (ctx.contraindications.length > 0) {
    sections.push(`## Kontraindikationen (HARTE GRENZEN — NIEMALS überschreiten)
${ctx.contraindications.map((c) => `- ${c}`).join('\n')}`)
  }

  if (ctx.therapistNotes) {
    sections.push(`## Therapeuten-Hinweise
${ctx.therapistNotes}`)
  }

  if (Object.keys(ctx.exerciseModifications).length > 0) {
    const mods = Object.entries(ctx.exerciseModifications)
      .map(([exercise, alt]) => `- ${exercise} → ${alt}`)
      .join('\n')
    sections.push(`## Übungs-Modifikationen
${mods}`)
  }

  if (ctx.painLog.length > 0) {
    const recent = ctx.painLog.slice(0, 5)
    const painLines = recent.map((p: PainEntry) =>
      `- ${p.location}: ${p.intensity}/10 (${p.type}) am ${p.timestamp.split('T')[0]}`
    ).join('\n')
    sections.push(`## Letzte Schmerzberichte
${painLines}`)
  }

  if (Object.keys(ctx.mobilityBaseline).length > 0) {
    const baselines = Object.entries(ctx.mobilityBaseline)
      .map(([joint, degrees]) => `- ${joint}: ${degrees}°`)
      .join('\n')
    sections.push(`## Mobilitäts-Baseline
${baselines}`)
  }

  return sections.join('\n\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/physio/coach-policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/physio/coach-policy.ts tests/lib/physio/coach-policy.test.ts
git commit -m "feat(physio): add physio-specific coach policy with contraindications and pain context"
```

---

### Task 7: Enable canExecuteTool restrictions for physio mode

**Files:**
- Modify: `lib/privacy/hooks.ts`
- Test: `tests/lib/privacy/hooks-physio.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/privacy/hooks-physio.test.ts
import { describe, it, expect } from 'vitest'
import { canExecuteTool } from '@/lib/privacy/hooks'

describe('canExecuteTool in physio mode', () => {
  it('blocks adjust_timer at high sensitivity', () => {
    expect(canExecuteTool('adjust_timer', 'high')).toBe(false)
  })

  it('blocks adjust_intensity at high sensitivity', () => {
    expect(canExecuteTool('adjust_intensity', 'high')).toBe(false)
  })

  it('allows pause_workout at high sensitivity', () => {
    expect(canExecuteTool('pause_workout', 'high')).toBe(true)
  })

  it('allows end_session at high sensitivity', () => {
    expect(canExecuteTool('end_session', 'high')).toBe(true)
  })

  it('allows log_pain at any sensitivity', () => {
    expect(canExecuteTool('log_pain', 'high')).toBe(true)
  })

  it('allows everything at normal sensitivity', () => {
    expect(canExecuteTool('next_exercise', 'normal')).toBe(true)
    expect(canExecuteTool('adjust_timer', 'normal')).toBe(true)
  })
})
```

- [ ] **Step 2: Update canExecuteTool**

In `lib/privacy/hooks.ts`, replace the stub with real logic:

```typescript
const BLOCKED_AT_HIGH_SENSITIVITY = ['adjust_timer', 'adjust_intensity']

export function canExecuteTool(toolName: string, sensitivityLevel: string): boolean {
  if (sensitivityLevel === 'high' && BLOCKED_AT_HIGH_SENSITIVITY.includes(toolName)) {
    return false
  }
  return true
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/lib/privacy/hooks-physio.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/privacy/hooks.ts tests/lib/privacy/hooks-physio.test.ts
git commit -m "feat(physio): enable tool gating based on sensitivity level"
```

---

## Chunk 4: Integration & Consent Upgrade

### Task 8: Integrate sensitivity router into server orchestrator

**Files:**
- Modify: `lib/voice/server-orchestrator.ts`
- Modify: `app/api/voice/realtime/stream/route.ts`

- [ ] **Step 1: Update server orchestrator**

In `streamVoiceTurnOrchestration()`:
1. Import `classifySensitivity` from `@/lib/physio/sensitivity-router`
2. Import `loadPhysioContext` from `@/lib/physio/context-loader`
3. Import `buildPhysioPolicyPrompt` from `@/lib/physio/coach-policy`
4. On each turn, run `classifySensitivity(userMessage)`
5. If level is `elevated` or `high`: override to Safety mode + Sonnet
6. If physio mode is active (plan has contraindications): load PhysioContext and append physio policy to system prompt
7. Pass sensitivity level to `canExecuteTool` for any tool calls in the response

- [ ] **Step 2: Update SSE route**

Accept `planId` in the POST body to enable PhysioContext loading.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/voice/server-orchestrator.ts app/api/voice/realtime/stream/route.ts
git commit -m "feat(physio): integrate sensitivity routing and physio context into orchestrator"
```

---

### Task 9: Wire pain tool execution in SessionPlayer

**Files:**
- Modify: `components/training/SessionPlayer.tsx`

- [ ] **Step 1: Handle log_pain tool call**

In SessionPlayer's `onToolCall` handler:
1. When `tool.name === 'log_pain'`:
   - POST to `/api/physio/pain` with the tool input + current exerciseId + sessionId
   - If response `shouldAbort === true`:
     - Speak "Die Schmerzen sind zu stark. Lass uns aufhören und sprich bitte mit deinem Therapeuten."
     - Execute `end_session` tool to stop the workout
   - Otherwise: continue normally, coach will acknowledge the pain log

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/training/SessionPlayer.tsx
git commit -m "feat(physio): wire pain tool execution with session abort on high intensity"
```

---

### Task 10: Add consent upgrade for physio mode

**Files:**
- Create: `lib/physio/consent.ts`
- Modify: `app/training/session/page.tsx`
- Test: `tests/lib/physio/consent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/physio/consent.test.ts
import { describe, it, expect } from 'vitest'
import { requiresPhysioConsent, PHYSIO_CONSENT_MESSAGE } from '@/lib/physio/consent'

describe('physio consent', () => {
  it('requires consent when plan has contraindications', () => {
    expect(requiresPhysioConsent({ contraindications: ['No overhead'] })).toBe(true)
  })

  it('does not require consent for plain fitness plan', () => {
    expect(requiresPhysioConsent({ contraindications: [] })).toBe(false)
  })

  it('does not require consent when contraindications undefined', () => {
    expect(requiresPhysioConsent({})).toBe(false)
  })

  it('has a consent message in German', () => {
    expect(PHYSIO_CONSENT_MESSAGE).toContain('Gesundheitsdaten')
  })
})
```

- [ ] **Step 2: Write the consent module**

```typescript
// lib/physio/consent.ts

export const PHYSIO_CONSENT_MESSAGE =
  'Dieser Trainingsplan enthält physiotherapeutische Übungen. ' +
  'Deine Gesundheitsdaten (Schmerzberichte, Mobilitätswerte) werden besonders geschützt gespeichert. ' +
  'Möchtest du fortfahren?'

export function requiresPhysioConsent(plan: { contraindications?: string[] }): boolean {
  return (plan.contraindications?.length ?? 0) > 0
}
```

- [ ] **Step 3: Add consent check to session page**

In `app/training/session/page.tsx`:
1. After loading the plan, check `requiresPhysioConsent(plan)`
2. If true and user hasn't accepted yet: show a consent dialog with `PHYSIO_CONSENT_MESSAGE`
3. On accept: store acceptance in `sessionStorage` (per-session) and proceed
4. On decline: redirect back to dashboard

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/lib/physio/consent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/physio/consent.ts tests/lib/physio/consent.test.ts app/training/session/page.tsx
git commit -m "feat(physio): add consent upgrade dialog for physiotherapy sessions"
```

---

### Task 11: Add Class D audit logging

**Files:**
- Modify: `lib/memory/extractor.ts`
- Modify: `lib/memory/resolver.ts`

- [ ] **Step 1: Add audit log on Class D memory operations**

When the memory extractor encounters Class D data (medical keywords detected):
1. Log to `voice_telemetry_events` with `event_type: 'class_d_write'`
2. Include: `{ table, action, data_class: 'D', memory_category }`

When the MemoryResolver retrieves memories tagged as Class D:
1. Log to `voice_telemetry_events` with `event_type: 'class_d_read'`
2. Include: `{ action: 'retrieve', data_class: 'D', memory_count }`

- [ ] **Step 2: Enable Class D storage (update privacy hook)**

In `lib/privacy/hooks.ts`, change `canStoreMemory` to allow Class D when consent is `full` (was blocked in Stage 4):

```typescript
// Remove the Stage 4 block:
// if (ctx.dataClass === DataClass.MedicalRehab) return false
// Replace with:
if (ctx.dataClass === DataClass.MedicalRehab && ctx.consent !== 'full') return false
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS (update any Stage 4 tests that expected Class D to be blocked)

- [ ] **Step 4: Commit**

```bash
git add lib/memory/extractor.ts lib/memory/resolver.ts lib/privacy/hooks.ts
git commit -m "feat(physio): enable Class D storage with audit logging"
```

---

### Task 12: Add physio columns to training_plans table

**Files:**
- Create: `supabase/migrations/add_physio_plan_columns.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/add_physio_plan_columns.sql
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS contraindications TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS therapist_notes TEXT,
ADD COLUMN IF NOT EXISTS exercise_modifications JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS mobility_baseline JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'fitness' CHECK (plan_type IN ('fitness', 'physio'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/add_physio_plan_columns.sql
git commit -m "feat(physio): add physio columns to training_plans table"
```

---

### Task 13: Final integration and smoke test

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Manual physio flow test**

1. Create a plan with contraindications (manual DB insert or seed script)
2. Start session → verify consent dialog appears
3. Accept → verify physio policy is active (coach mentions contraindications)
4. Report pain "Stechender Schmerz im Knie, 5 von 10" → verify log_pain tool fires
5. Report severe pain "Schmerz ist 9 von 10" → verify session abort
6. Check `/admin/voice-metrics` → verify Class D audit events
7. Check pain_log table → verify entries stored

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat: complete Stage 5 — physio expansion with sensitivity routing, pain tracking, and compliance"
```
