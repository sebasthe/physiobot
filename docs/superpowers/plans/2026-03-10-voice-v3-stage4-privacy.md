# Voice V3 Stage 4: Privacy & Compliance

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add data classification (Classes A-C), privacy hooks (store/retrieve/redact/execute/retain), user-facing controls (memory view, reset, export, deletion), and wrap the MemoryResolver with consent-aware filtering.

**Architecture:** Privacy is a utility layer (`lib/privacy/`) — not a service. Classification is metadata on existing data (a `data_class` field on Mem0 entries and telemetry). Privacy hooks are functions called from existing code paths. User controls extend the existing Settings page. The MemoryResolver from Stage 2 gains a privacy wrapper that filters based on consent level.

**Tech Stack:** TypeScript, Supabase (RLS, data queries), Mem0, Vitest

**Branch:** `feature/voice-v3-privacy` (create from `main` after Stage 3 is merged)

**Spec:** `docs/superpowers/specs/2026-03-10-voice-v3-staged-design.md` — Stage 4

**Prerequisite:** Stage 3 must be merged to `main`.

---

## Chunk 1: Data Classification & Privacy Hooks

### Task 1: Define classification types and constants

**Files:**
- Create: `lib/privacy/types.ts`
- Test: `tests/lib/privacy/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/privacy/types.test.ts
import { describe, it, expect } from 'vitest'
import { DataClass, RETENTION_DAYS, isValidDataClass, type ConsentLevel } from '@/lib/privacy/types'

describe('DataClass', () => {
  it('has four classes', () => {
    expect(DataClass.Operational).toBe('A')
    expect(DataClass.PersonalCoaching).toBe('B')
    expect(DataClass.SensitiveWellness).toBe('C')
    expect(DataClass.MedicalRehab).toBe('D')
  })
})

describe('RETENTION_DAYS', () => {
  it('operational data retained 90 days', () => {
    expect(RETENTION_DAYS[DataClass.Operational]).toBe(90)
  })

  it('personal coaching data has no auto-expiry', () => {
    expect(RETENTION_DAYS[DataClass.PersonalCoaching]).toBeNull()
  })

  it('sensitive wellness data has no auto-expiry', () => {
    expect(RETENTION_DAYS[DataClass.SensitiveWellness]).toBeNull()
  })

  it('medical data has no auto-expiry (managed by compliance)', () => {
    expect(RETENTION_DAYS[DataClass.MedicalRehab]).toBeNull()
  })
})

describe('isValidDataClass', () => {
  it('accepts valid classes', () => {
    expect(isValidDataClass('A')).toBe(true)
    expect(isValidDataClass('B')).toBe(true)
    expect(isValidDataClass('C')).toBe(true)
    expect(isValidDataClass('D')).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isValidDataClass('X')).toBe(false)
    expect(isValidDataClass('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/privacy/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types**

```typescript
// lib/privacy/types.ts

export enum DataClass {
  Operational = 'A',
  PersonalCoaching = 'B',
  SensitiveWellness = 'C',
  MedicalRehab = 'D',
}

export const RETENTION_DAYS: Record<DataClass, number | null> = {
  [DataClass.Operational]: 90,
  [DataClass.PersonalCoaching]: null,   // until user deletes
  [DataClass.SensitiveWellness]: null,  // until user deletes
  [DataClass.MedicalRehab]: null,       // managed by compliance layer in Stage 5
}

export type ConsentLevel = 'full' | 'minimal' | 'none'

export interface ClassifiedData {
  dataClass: DataClass
  content: unknown
  createdAt: string
  userId: string
}

export function isValidDataClass(value: string): value is DataClass {
  return Object.values(DataClass).includes(value as DataClass)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/privacy/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/privacy/types.ts tests/lib/privacy/types.test.ts
git commit -m "feat(privacy): add data classification types and retention constants"
```

---

### Task 2: Create data classifier

**Files:**
- Create: `lib/privacy/classifier.ts`
- Test: `tests/lib/privacy/classifier.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/privacy/classifier.test.ts
import { describe, it, expect } from 'vitest'
import { classifyMemory, classifyTelemetryEvent } from '@/lib/privacy/classifier'
import { DataClass } from '@/lib/privacy/types'

describe('classifyMemory', () => {
  it('classifies motivation as SensitiveWellness', () => {
    expect(classifyMemory('motivation_hints', 'Für meine Kinder da sein')).toBe(DataClass.SensitiveWellness)
  })

  it('classifies personality as PersonalCoaching', () => {
    expect(classifyMemory('personality_preferences', 'direkt')).toBe(DataClass.PersonalCoaching)
  })

  it('classifies training patterns as PersonalCoaching', () => {
    expect(classifyMemory('training_patterns', 'Schulter bei Überkopf')).toBe(DataClass.PersonalCoaching)
  })

  it('classifies life context as SensitiveWellness', () => {
    expect(classifyMemory('life_context', 'Bürojob, 2 Kinder')).toBe(DataClass.SensitiveWellness)
  })

  it('classifies pain mentions as MedicalRehab', () => {
    expect(classifyMemory('training_patterns', 'Stechender Schmerz im Knie seit 2 Wochen')).toBe(DataClass.MedicalRehab)
  })
})

describe('classifyTelemetryEvent', () => {
  it('classifies all telemetry as Operational', () => {
    expect(classifyTelemetryEvent('turn_metrics')).toBe(DataClass.Operational)
    expect(classifyTelemetryEvent('listen_started')).toBe(DataClass.Operational)
    expect(classifyTelemetryEvent('voice_error')).toBe(DataClass.Operational)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/privacy/classifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the classifier**

```typescript
// lib/privacy/classifier.ts
import { DataClass } from './types'

const MEDICAL_KEYWORDS = [
  'schmerz', 'diagnose', 'arzt', 'therapeut', 'medikament',
  'bandscheibe', 'entzünd', 'operation', 'reha', 'befund',
  'stechend', 'ziehend', 'krampf',
]

const MEMORY_CLASS_MAP: Record<string, DataClass> = {
  motivation_hints: DataClass.SensitiveWellness,
  personality_preferences: DataClass.PersonalCoaching,
  training_patterns: DataClass.PersonalCoaching,
  life_context: DataClass.SensitiveWellness,
}

export function classifyMemory(category: string, content: string): DataClass {
  // Check for medical content first — overrides category-based classification
  const lower = content.toLowerCase()
  if (MEDICAL_KEYWORDS.some((kw) => lower.includes(kw))) {
    return DataClass.MedicalRehab
  }

  return MEMORY_CLASS_MAP[category] ?? DataClass.PersonalCoaching
}

export function classifyTelemetryEvent(_eventType: string): DataClass {
  // All telemetry is operational — no personal content in telemetry payloads
  // (transcript text is stripped by shouldRedactLog before storage)
  return DataClass.Operational
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/privacy/classifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/privacy/classifier.ts tests/lib/privacy/classifier.test.ts
git commit -m "feat(privacy): add memory and telemetry data classifier"
```

---

### Task 3: Create privacy hooks

**Files:**
- Create: `lib/privacy/hooks.ts`
- Test: `tests/lib/privacy/hooks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/privacy/hooks.test.ts
import { describe, it, expect } from 'vitest'
import {
  canStoreMemory,
  canRetrieveMemory,
  shouldRedactLog,
  canExecuteTool,
} from '@/lib/privacy/hooks'
import { DataClass } from '@/lib/privacy/types'

describe('canStoreMemory', () => {
  it('allows storing Class B with full consent', () => {
    expect(canStoreMemory({ dataClass: DataClass.PersonalCoaching, consent: 'full' })).toBe(true)
  })

  it('allows storing Class A always', () => {
    expect(canStoreMemory({ dataClass: DataClass.Operational, consent: 'minimal' })).toBe(true)
  })

  it('blocks storing Class C with minimal consent', () => {
    expect(canStoreMemory({ dataClass: DataClass.SensitiveWellness, consent: 'minimal' })).toBe(false)
  })

  it('blocks storing anything with no consent', () => {
    expect(canStoreMemory({ dataClass: DataClass.PersonalCoaching, consent: 'none' })).toBe(false)
  })

  it('blocks Class D in Stage 4 (not yet supported)', () => {
    expect(canStoreMemory({ dataClass: DataClass.MedicalRehab, consent: 'full' })).toBe(false)
  })
})

describe('canRetrieveMemory', () => {
  it('allows retrieving Class A always', () => {
    expect(canRetrieveMemory({ dataClass: DataClass.Operational, consent: 'minimal' })).toBe(true)
  })

  it('allows retrieving Class B with full consent', () => {
    expect(canRetrieveMemory({ dataClass: DataClass.PersonalCoaching, consent: 'full' })).toBe(true)
  })

  it('blocks retrieving Class C with minimal consent', () => {
    expect(canRetrieveMemory({ dataClass: DataClass.SensitiveWellness, consent: 'minimal' })).toBe(false)
  })
})

describe('shouldRedactLog', () => {
  it('strips transcript text from Class B events', () => {
    const event = { event_type: 'agent_reply', payload: { text: 'Gut gemacht!', latency: 100 } }
    const redacted = shouldRedactLog(event, DataClass.PersonalCoaching)
    expect(redacted.payload.text).toBeUndefined()
    expect(redacted.payload.latency).toBe(100)
  })

  it('keeps Class A events intact', () => {
    const event = { event_type: 'turn_metrics', payload: { totalTurnTime: 1200 } }
    const redacted = shouldRedactLog(event, DataClass.Operational)
    expect(redacted.payload.totalTurnTime).toBe(1200)
  })
})

describe('canExecuteTool', () => {
  it('allows all tools in normal sensitivity', () => {
    expect(canExecuteTool('next_exercise', 'normal')).toBe(true)
    expect(canExecuteTool('end_session', 'normal')).toBe(true)
  })

  it('allows all tools in current Stage 4 (no restrictions yet)', () => {
    // Stage 5 will add sensitivity-based restrictions
    expect(canExecuteTool('next_exercise', 'elevated')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/privacy/hooks.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the privacy hooks**

```typescript
// lib/privacy/hooks.ts
import { DataClass, type ConsentLevel } from './types'

interface StoreContext {
  dataClass: DataClass
  consent: ConsentLevel
}

interface RetrieveContext {
  dataClass: DataClass
  consent: ConsentLevel
}

interface TelemetryEvent {
  event_type: string
  payload: Record<string, unknown>
}

// --- canStoreMemory ---

const STORE_CONSENT_REQUIRED: Record<DataClass, ConsentLevel> = {
  [DataClass.Operational]: 'minimal',
  [DataClass.PersonalCoaching]: 'full',
  [DataClass.SensitiveWellness]: 'full',
  [DataClass.MedicalRehab]: 'full', // blocked in Stage 4 regardless
}

export function canStoreMemory(ctx: StoreContext): boolean {
  // Class D not supported until Stage 5
  if (ctx.dataClass === DataClass.MedicalRehab) return false

  if (ctx.consent === 'none') return false

  const required = STORE_CONSENT_REQUIRED[ctx.dataClass]
  if (required === 'full' && ctx.consent !== 'full') return false

  return true
}

// --- canRetrieveMemory ---

export function canRetrieveMemory(ctx: RetrieveContext): boolean {
  if (ctx.dataClass === DataClass.MedicalRehab) return false
  if (ctx.dataClass === DataClass.Operational) return true
  if (ctx.consent === 'none') return false
  if (ctx.consent === 'minimal' && ctx.dataClass !== DataClass.Operational) return false
  return true
}

// --- shouldRedactLog ---

const TEXT_FIELDS = ['text', 'transcript', 'reply', 'content', 'message']

export function shouldRedactLog(event: TelemetryEvent, dataClass: DataClass): TelemetryEvent {
  if (dataClass === DataClass.Operational) return event

  // Strip text content from non-operational events
  const redactedPayload = { ...event.payload }
  for (const field of TEXT_FIELDS) {
    if (field in redactedPayload) {
      delete redactedPayload[field]
    }
  }
  return { ...event, payload: redactedPayload }
}

// --- canExecuteTool ---

export function canExecuteTool(toolName: string, sensitivityLevel: string): boolean {
  // Stage 4: no tool restrictions. Stage 5 adds sensitivity-based gating.
  return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/privacy/hooks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/privacy/hooks.ts tests/lib/privacy/hooks.test.ts
git commit -m "feat(privacy): add canStoreMemory, canRetrieveMemory, shouldRedactLog, canExecuteTool hooks"
```

---

### Task 4: Create retention enforcer

**Files:**
- Create: `lib/privacy/retention.ts`
- Test: `tests/lib/privacy/retention.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/privacy/retention.test.ts
import { describe, it, expect, vi } from 'vitest'
import { enforceRetention } from '@/lib/privacy/retention'

// Mock Supabase
const mockDelete = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    lt: vi.fn().mockResolvedValue({ error: null, count: 5 }),
  }),
})
const mockFrom = vi.fn().mockReturnValue({ delete: mockDelete })

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
  }),
}))

describe('enforceRetention', () => {
  it('deletes Class A telemetry older than 90 days', async () => {
    const result = await enforceRetention('user-123')
    expect(mockFrom).toHaveBeenCalledWith('voice_telemetry_events')
    expect(result.deletedCount).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Write the retention enforcer**

```typescript
// lib/privacy/retention.ts
import { createClient } from '@/lib/supabase/server'
import { DataClass, RETENTION_DAYS } from './types'

interface RetentionResult {
  deletedCount: number
}

export async function enforceRetention(userId: string): Promise<RetentionResult> {
  const supabase = await createClient()
  let totalDeleted = 0

  // Enforce Class A retention (90 days)
  const classARetention = RETENTION_DAYS[DataClass.Operational]
  if (classARetention !== null) {
    const cutoff = new Date(Date.now() - classARetention * 24 * 60 * 60 * 1000).toISOString()

    const { count } = await supabase
      .from('voice_telemetry_events')
      .delete()
      .eq('user_id', userId)
      .lt('created_at', cutoff)

    totalDeleted += count ?? 0
  }

  // Classes B and C: no auto-expiry — only deleted on user request
  // Class D: not implemented until Stage 5

  return { deletedCount: totalDeleted }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/lib/privacy/retention.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/privacy/retention.ts tests/lib/privacy/retention.test.ts
git commit -m "feat(privacy): add retention enforcer for Class A telemetry"
```

---

## Chunk 2: Integration into Existing Flows

### Task 5: Wrap memory extractor with classification and consent

**Files:**
- Modify: `lib/memory/extractor.ts`
- Test: `tests/lib/memory/extractor-privacy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/memory/extractor-privacy.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            motivation_hints: ['Will für Kinder fit bleiben'],
            personality_preferences: { communicationStyle: 'direkt', encouragementType: 'challenge-driven' },
            training_patterns: { knownPainPoints: [], preferredExercises: [], fatigueSignals: [] },
            life_context: ['Bürojob'],
          }),
        }],
      }),
    },
  })),
}))

const mockAdd = vi.fn().mockResolvedValue({ id: 'mem-1' })
vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({ add: mockAdd })),
}))

import { extractSessionInsights } from '@/lib/memory/extractor'

describe('memory extractor with privacy', () => {
  it('classifies each memory entry before storing', async () => {
    mockAdd.mockClear()
    const transcript = [
      { role: 'user', content: 'Ich mache das für meine Kinder' },
      { role: 'assistant', content: 'Das ist toll!' },
    ]

    await extractSessionInsights('user-123', transcript, 'full')
    // Mem0 add should have been called with metadata including data_class
    for (const call of mockAdd.mock.calls) {
      const metadata = call[1]?.metadata
      expect(metadata).toHaveProperty('data_class')
    }
  })

  it('skips storing sensitive memories when consent is minimal', async () => {
    mockAdd.mockClear()
    const transcript = [
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Ok' },
    ]

    await extractSessionInsights('user-123', transcript, 'minimal')
    // Should not have stored motivation or life_context (Class C)
    // Only personality/training (Class B) if consent allows — but minimal blocks B too
    expect(mockAdd).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Update memory extractor**

In `lib/memory/extractor.ts`:
1. Add `consent: ConsentLevel` parameter to `extractSessionInsights()`
2. Before each `mem0.add()` call, classify the memory with `classifyMemory()`
3. Check `canStoreMemory({ dataClass, consent })` — skip if returns false
4. Add `data_class` to Mem0 metadata

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/lib/memory/extractor-privacy.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/memory/extractor.ts tests/lib/memory/extractor-privacy.test.ts
git commit -m "feat(privacy): wrap memory extraction with classification and consent checks"
```

---

### Task 6: Wrap MemoryResolver with privacy filtering

**Files:**
- Modify: `lib/memory/resolver.ts`
- Test: `tests/lib/memory/resolver-privacy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/memory/resolver-privacy.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue([
      { memory: 'Motivation: Für meine Kinder', metadata: { data_class: 'C' } },
      { memory: 'Kommunikationsstil: direkt', metadata: { data_class: 'B' } },
    ]),
  })),
}))

import { MemoryResolver } from '@/lib/memory/resolver'

describe('MemoryResolver with privacy', () => {
  it('filters out Class C memories when consent is minimal', async () => {
    const resolver = new MemoryResolver()
    const snapshot = await resolver.getSessionSnapshot('user-123', 5, 'minimal')
    // kernMotivation is Class C — should be filtered out
    expect(snapshot.kernMotivation).toBeNull()
  })

  it('includes all memories when consent is full', async () => {
    const resolver = new MemoryResolver()
    resolver.clearCache()
    const snapshot = await resolver.getSessionSnapshot('user-123', 5, 'full')
    expect(snapshot.kernMotivation).toBeDefined()
  })
})
```

- [ ] **Step 2: Update MemoryResolver**

In `lib/memory/resolver.ts`:
1. Add `consent: ConsentLevel` parameter to `getSessionSnapshot()`
2. After fetching from Mem0, filter results through `canRetrieveMemory()` using the `data_class` from metadata
3. Only include memories that pass the consent check in the snapshot

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/lib/memory/resolver-privacy.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/memory/resolver.ts tests/lib/memory/resolver-privacy.test.ts
git commit -m "feat(privacy): wrap MemoryResolver with consent-aware filtering"
```

---

### Task 7: Wrap telemetry with redaction

**Files:**
- Modify: `app/api/voice/telemetry/route.ts`
- Test: `tests/api/voice/telemetry-redaction.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/voice/telemetry-redaction.test.ts
import { describe, it, expect } from 'vitest'
import { shouldRedactLog } from '@/lib/privacy/hooks'
import { DataClass } from '@/lib/privacy/types'

describe('telemetry redaction integration', () => {
  it('strips text from agent_reply events', () => {
    const event = {
      event_type: 'agent_reply_received',
      payload: { reply: 'Gut gemacht!', llmLatencyMs: 120, totalLatencyMs: 200 },
    }
    const redacted = shouldRedactLog(event, DataClass.PersonalCoaching)
    expect(redacted.payload.reply).toBeUndefined()
    expect(redacted.payload.llmLatencyMs).toBe(120)
  })

  it('preserves turn_metrics events fully', () => {
    const event = {
      event_type: 'turn_metrics',
      payload: { totalTurnTime: 1200, sttToClassification: 50 },
    }
    const redacted = shouldRedactLog(event, DataClass.Operational)
    expect(redacted.payload.totalTurnTime).toBe(1200)
  })
})
```

- [ ] **Step 2: Update telemetry route**

In `app/api/voice/telemetry/route.ts`:
1. Import `shouldRedactLog` from `@/lib/privacy/hooks`
2. Import `classifyTelemetryEvent` from `@/lib/privacy/classifier`
3. Before inserting into Supabase, classify the event and run `shouldRedactLog()`
4. Store the redacted payload

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/api/voice/telemetry-redaction.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/voice/telemetry/route.ts tests/api/voice/telemetry-redaction.test.ts
git commit -m "feat(privacy): redact transcript text from telemetry before storage"
```

---

## Chunk 3: User-Facing Controls

### Task 8: Add consent level to user profile

**Files:**
- Create Supabase migration: `supabase/migrations/add_privacy_consent.sql`
- Modify: `lib/types.ts` (add consent field to profile type)

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/add_privacy_consent.sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS privacy_consent TEXT DEFAULT 'full'
CHECK (privacy_consent IN ('full', 'minimal', 'none'));
```

- [ ] **Step 2: Update profile type**

In `lib/types.ts`, add `privacy_consent?: 'full' | 'minimal' | 'none'` to the profile-related types.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/add_privacy_consent.sql lib/types.ts
git commit -m "feat(privacy): add privacy_consent column to profiles"
```

---

### Task 9: Add memory API routes

**Files:**
- Create: `app/api/privacy/memories/route.ts`
- Create: `app/api/privacy/export/route.ts`
- Create: `app/api/privacy/delete/route.ts`

- [ ] **Step 1: Write the memories list endpoint**

```typescript
// app/api/privacy/memories/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import MemoryClient from 'mem0ai'

const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY ?? '' })

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const memories = await mem0.getAll({ user_id: user.id })

  // Format for display — human-readable
  const formatted = (memories ?? []).map((m: { id: string; memory: string; metadata?: Record<string, unknown>; created_at?: string }) => ({
    id: m.id,
    content: m.memory,
    dataClass: m.metadata?.data_class ?? 'B',
    createdAt: m.created_at,
  }))

  return NextResponse.json({ memories: formatted })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await mem0.deleteAll({ user_id: user.id })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Write the export endpoint**

```typescript
// app/api/privacy/export/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import MemoryClient from 'mem0ai'

const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY ?? '' })

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Collect all user data
  const [memories, { data: profile }, { data: sessions }, { data: healthProfile }] = await Promise.all([
    mem0.getAll({ user_id: user.id }),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('sessions').select('*').eq('user_id', user.id),
    supabase.from('health_profiles').select('*').eq('user_id', user.id).single(),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile,
    healthProfile,
    sessions,
    memories: memories ?? [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="physiobot-export-${user.id}.json"`,
    },
  })
}
```

- [ ] **Step 3: Write the account deletion endpoint**

```typescript
// app/api/privacy/delete/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import MemoryClient from 'mem0ai'

const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY ?? '' })

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Cascading delete
  await Promise.all([
    mem0.deleteAll({ user_id: user.id }),
    supabase.from('voice_telemetry_events').delete().eq('user_id', user.id),
    supabase.from('sessions').delete().eq('user_id', user.id),
    supabase.from('health_profiles').delete().eq('user_id', user.id),
    supabase.from('streaks').delete().eq('user_id', user.id),
    supabase.from('profiles').delete().eq('id', user.id),
  ])

  // Sign out
  await supabase.auth.signOut()

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/privacy/
git commit -m "feat(privacy): add memory list, data export, and account deletion endpoints"
```

---

### Task 10: Add privacy controls to Settings page

**Files:**
- Modify: `app/settings/SettingsClient.tsx`

- [ ] **Step 1: Add privacy section to Settings UI**

Read the existing `SettingsClient.tsx` and add a new section at the bottom with:

1. **Consent Level** — radio group: "Voll" (full), "Minimal" (minimal), "Keine Speicherung" (none)
   - Saves to `profiles.privacy_consent` via Supabase
2. **Erinnerungen ansehen** — button that fetches GET `/api/privacy/memories` and displays a list
   - Each memory shows content and classification badge (A/B/C)
3. **Erinnerungen löschen** — button with confirmation dialog, calls DELETE `/api/privacy/memories`
4. **Daten exportieren** — link to GET `/api/privacy/export` (downloads JSON)
5. **Konto löschen** — red button with strong confirmation dialog, calls POST `/api/privacy/delete`

- [ ] **Step 2: Run dev server and test manually**

1. Open Settings page
2. Change consent level — verify it saves
3. View memories — verify list appears
4. Export data — verify JSON downloads
5. Reset memories — verify they're cleared

- [ ] **Step 3: Commit**

```bash
git add app/settings/SettingsClient.tsx
git commit -m "feat(privacy): add memory view, consent, export, and deletion controls to Settings"
```

---

### Task 11: Wire consent level through the voice pipeline

**Files:**
- Modify: `lib/voice/server-orchestrator.ts`
- Modify: `app/api/voice/realtime/stream/route.ts`
- Modify: `app/api/feedback/route.ts`

- [ ] **Step 1: Load consent in SSE route**

In `app/api/voice/realtime/stream/route.ts`:
1. After authenticating, query `profiles.privacy_consent` for the user
2. Pass consent level to `streamVoiceTurnOrchestration()`
3. The orchestrator passes it to `MemoryResolver.getSessionSnapshot()`

- [ ] **Step 2: Pass consent to memory extraction**

In `app/api/feedback/route.ts`:
1. Load `privacy_consent` from user profile
2. Pass to `extractSessionInsights()`

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/voice/server-orchestrator.ts app/api/voice/realtime/stream/route.ts app/api/feedback/route.ts
git commit -m "feat(privacy): wire consent level through voice pipeline and memory extraction"
```

---

### Task 12: Add retention enforcement on login

**Files:**
- Modify: `app/auth/callback/route.ts`

- [ ] **Step 1: Call retention enforcer after auth callback**

In `app/auth/callback/route.ts`:
1. Import `enforceRetention` from `@/lib/privacy/retention`
2. After successful auth callback, call `enforceRetention(userId)` (fire-and-forget)
3. This runs the 90-day cleanup for Class A data on every login

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "feat(privacy): enforce retention on user login"
```

---

### Task 13: Final integration and smoke test

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Manual privacy flow test**

1. Set consent to "minimal" → start session → verify coach doesn't reference kern motivation
2. Set consent to "full" → start session → verify coach uses all memories
3. View memories → verify classification badges
4. Reset memories → verify empty
5. Export data → verify complete JSON
6. Check telemetry → verify no transcript text in stored events

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat: complete Stage 4 — privacy with classification, consent, and user controls"
```
