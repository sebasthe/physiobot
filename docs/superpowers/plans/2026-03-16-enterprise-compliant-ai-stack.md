# Enterprise-Compliant AI Stack Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate PhysioBot from direct Anthropic SDK to Vercel AI SDK with swappable EU-compliant LLM providers (Anthropic, Azure OpenAI, Google Vertex AI) and add a RAG demo feature.

**Architecture:** Replace `@anthropic-ai/sdk` with Vercel AI SDK (`ai` + provider packages). Create a model registry that resolves provider + model from env config. Each API route calls the registry instead of a hardcoded Anthropic client. RAG demo uses Azure Cognitive Search for retrieval, rendered as a separate demo page.

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/azure`, `@ai-sdk/google-vertex`), Azure Cognitive Search (`@azure/search-documents`), Zod (for `generateObject` schemas), Vitest for testing.

---

## Chunk 1: Vercel AI SDK Migration

Replaces all 4 Anthropic SDK call sites with Vercel AI SDK equivalents. No provider switching yet — just Anthropic through the new SDK.

### Task 1: Install Vercel AI SDK packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install core packages**

```bash
npm install ai @ai-sdk/anthropic zod
```

Note: `zod` is only a transitive dependency via `mem0ai` — install it explicitly for `generateObject` schemas.

- [ ] **Step 2: Verify installation**

```bash
node -e "require('ai'); require('@ai-sdk/anthropic'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install Vercel AI SDK and Anthropic provider"
```

---

### Task 2: Create model registry

**Files:**
- Create: `lib/ai/registry.ts`
- Create: `lib/ai/registry.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/ai/registry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Reset module cache + env before each test so env var changes take effect
beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

describe('getModel', () => {
  it('returns anthropic model by default', async () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic')
    vi.stubEnv('LLM_MODEL', 'claude-haiku-4-5-20251001')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')

    const { getModel } = await import('./registry')
    const model = getModel()

    expect(model.modelId).toBe('claude-haiku-4-5-20251001')
    expect(model.provider).toContain('anthropic')
  })

  it('throws if provider is unknown', async () => {
    vi.stubEnv('LLM_PROVIDER', 'unknown-provider')

    const { getModel } = await import('./registry')
    expect(() => getModel()).toThrow('Unknown LLM provider')
  })

  it('allows override via parameters', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')

    const { getModel } = await import('./registry')
    const model = getModel({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' })

    expect(model.modelId).toBe('claude-sonnet-4-20250514')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/ai/registry.test.ts
```

Expected: FAIL — `./registry` module not found.

- [ ] **Step 3: Write implementation**

```typescript
// lib/ai/registry.ts
import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'

type ProviderName = 'anthropic' | 'azure-openai' | 'vertex'

interface ModelOptions {
  provider?: ProviderName
  model?: string
}

const defaults: Record<ProviderName, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  'azure-openai': 'gpt-4o',
  vertex: 'gemini-2.0-flash',
}

// Resolves the provider for a given model ID.
// If the model string contains a known provider prefix (e.g. 'claude-' → anthropic),
// use that provider. Otherwise fall back to the global LLM_PROVIDER env var.
function resolveProvider(model?: string): ProviderName {
  if (model?.startsWith('claude-')) return 'anthropic'
  if (model?.startsWith('gpt-')) return 'azure-openai'
  if (model?.startsWith('gemini-')) return 'vertex'
  return (process.env.LLM_PROVIDER as ProviderName) ?? 'anthropic'
}

export function getModel(options?: ModelOptions): LanguageModel {
  const provider = options?.provider ?? resolveProvider(options?.model) ?? (process.env.LLM_PROVIDER as ProviderName) ?? 'anthropic'
  const model = options?.model ?? process.env.LLM_MODEL ?? defaults[provider]

  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      return anthropic(model)
    }
    case 'azure-openai':
      throw new Error('Azure OpenAI provider not yet configured — see Task 8')
    case 'vertex':
      throw new Error('Vertex AI provider not yet configured — see Task 9')
    default:
      throw new Error(`Unknown LLM provider: ${provider}`)
  }
}
```

This design preserves the existing `getModelForMode()` pattern in `lib/coach/mode-selector.ts`. The voice orchestrator's `resolveCoachTurn()` already returns a model string like `'claude-sonnet-4-5-20241022'` (for safety/motivation) or `'claude-haiku-4-5-20251001'` (for performance/guidance). In the migrated code, that model string is passed directly: `getModel({ model: coachTurn.model })`, and `resolveProvider` auto-detects the correct provider from the model name prefix. No changes to `mode-selector.ts` needed.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/ai/registry.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/registry.ts lib/ai/registry.test.ts
git commit -m "feat: add LLM model registry with Anthropic provider"
```

---

### Task 3: Migrate plan generation route

**Files:**
- Modify: `app/api/generate-plan/route.ts`
- Create: `app/api/generate-plan/route.test.ts`
- Modify: `lib/claude/extract-json.ts` (may no longer be needed here)

- [ ] **Step 1: Write failing test**

```typescript
// app/api/generate-plan/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the AI SDK
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test-user' } } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: {
              motivation_style: 'goal-oriented',
              coaching_style: 'energetic',
              language: 'de',
            },
          })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/ai/registry', () => ({
  getModel: vi.fn(() => ({ modelId: 'test-model', provider: 'test' })),
}))

describe('generate-plan route', () => {
  it('uses generateObject from Vercel AI SDK', async () => {
    const { generateObject } = await import('ai')
    const mockGenerateObject = vi.mocked(generateObject)

    mockGenerateObject.mockResolvedValueOnce({
      object: {
        exercises: [
          {
            name: 'Test Exercise',
            description: 'A test',
            phase: 'warmup',
            duration_seconds: 30,
            reps: null,
            sets: null,
            voice_script: 'Do this test exercise',
          },
        ],
      },
    } as any)

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/generate-plan', {
      method: 'POST',
      body: JSON.stringify({
        healthProfile: {
          complaints: ['neck'],
          goals: 'flexibility',
          fitness_level: 'beginner',
          session_duration: 15,
          sessions_per_week: 3,
        },
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(mockGenerateObject).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/generate-plan/route.test.ts
```

Expected: FAIL — route still uses `anthropic.messages.create`.

- [ ] **Step 3: Read current route implementation**

Read `app/api/generate-plan/route.ts` in full to capture exact logic before modifying.

- [ ] **Step 4: Modify route to use Vercel AI SDK**

Replace the Anthropic SDK call in `app/api/generate-plan/route.ts`. The key changes:

```typescript
// REMOVE these imports:
// import { anthropic } from '@/lib/claude/client'
// import { extractJson } from '@/lib/claude/extract-json'

// ADD these imports:
import { generateObject } from 'ai'
import { getModel } from '@/lib/ai/registry'
import { z } from 'zod'

// Define the exercise schema for structured output:
const exerciseSchema = z.object({
  exercises: z.array(z.object({
    name: z.string(),
    description: z.string(),
    phase: z.enum(['warmup', 'main', 'cooldown']),
    duration_seconds: z.number().nullable(),
    reps: z.number().nullable(),
    sets: z.number().nullable(),
    voice_script: z.string(),
  })),
})

// REPLACE the anthropic.messages.create() call with:
const result = await generateObject({
  model: getModel(),
  schema: exerciseSchema,
  system: systemPrompt,
  messages: [{ role: 'user', content: message }],
  maxTokens: 2048,
})
const exercises = result.object.exercises
```

This eliminates `extractJson()` entirely for this route — `generateObject` returns typed, validated data.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run app/api/generate-plan/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/generate-plan/route.ts app/api/generate-plan/route.test.ts
git commit -m "refactor: migrate plan generation to Vercel AI SDK generateObject"
```

---

### Task 4: Migrate feedback route

**Files:**
- Modify: `app/api/feedback/route.ts`
- Create: `app/api/feedback/route.test.ts`

- [ ] **Step 1: Write failing test**

The feedback route queries multiple Supabase tables (`sessions`, `user_personality`, `profiles`, `training_plans`). The mock must return different data per table to reach the `generateObject` call. Key flow: auth check → save feedback → get personality + profile → get plan → call LLM → insert new plan.

```typescript
// app/api/feedback/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

vi.mock('@/lib/ai/registry', () => ({
  getModel: vi.fn(() => ({ modelId: 'test-model', provider: 'test' })),
}))

vi.mock('@/lib/mem0', () => ({
  addSessionTranscript: vi.fn().mockResolvedValue(undefined),
  extractAndStoreMemories: vi.fn().mockResolvedValue(undefined),
  getRelevantMemories: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/gamification', () => ({
  updateGamification: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/memory/extractor', () => ({
  extractSessionInsights: vi.fn().mockResolvedValue(undefined),
}))

// Per-table mock that returns different data depending on table name
function createMockSupabase() {
  const tableData: Record<string, any> = {
    sessions: { data: null, error: null },
    user_personality: {
      data: {
        motivation_style: 'goal-oriented',
        coaching_style: 'direct',
        language: 'de',
        coach_persona: 'tony_robbins',
        feedback_style: 'direct',
      },
    },
    profiles: { data: { active_plan_id: 'plan-123', privacy_consent: null } },
    training_plans: {
      data: {
        id: 'plan-123',
        exercises: [{ name: 'Test Exercise', phase: 'warmup', description: 'Test', duration_seconds: 30 }],
      },
    },
  }

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }) },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue(tableData[table] ?? { data: null }),
          maybeSingle: vi.fn().mockResolvedValue(tableData[table] ?? { data: null }),
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [] }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-plan-456' } }),
        })),
      })),
    })),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => createMockSupabase()),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('feedback route', () => {
  it('uses generateObject from Vercel AI SDK', async () => {
    const { generateObject } = await import('ai')
    const mockGenerateObject = vi.mocked(generateObject)

    mockGenerateObject.mockResolvedValueOnce({
      object: {
        exercises: [{ name: 'Updated Exercise', phase: 'warmup', description: 'Updated', duration_seconds: 30, reps: null, sets: null, voice_script: 'Do it' }],
      },
    } as any)

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'session-1',
        feedback: [{ exercise_id: 'ex-1', difficulty: 'too_easy' }],
      }),
    })

    const response = await POST(request)
    expect(mockGenerateObject).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/feedback/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Read current route and modify**

Read `app/api/feedback/route.ts`, then apply the same pattern as Task 3:
- Replace `anthropic.messages.create()` with `generateObject()` + Zod schema
- Remove `extractJson` import
- Import `getModel` from registry

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/feedback/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/feedback/route.ts app/api/feedback/route.test.ts
git commit -m "refactor: migrate feedback route to Vercel AI SDK generateObject"
```

---

### Task 5: Migrate voice orchestrator (non-streaming)

**Files:**
- Modify: `lib/voice/server-orchestrator.ts`
- Create: `lib/voice/server-orchestrator.test.ts`

The voice orchestrator is the most complex migration because it has:
- **Tool calling** — exercises can be navigated/skipped via LLM tool calls, with privacy-based `canExecuteTool()` gating
- **Mode-based model selection** — `resolveCoachTurn()` picks `claude-sonnet` for safety/motivation, `claude-haiku` for performance/guidance
- **Streaming with tool call chunks** — the streaming path must yield `tool_call` chunks

All of this must be preserved.

- [ ] **Step 1: Write failing test for non-streaming path**

```typescript
// lib/voice/server-orchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all heavy dependencies
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock('@/lib/ai/registry', () => ({
  getModel: vi.fn(() => ({ modelId: 'claude-haiku-4-5-20251001', provider: 'mock.anthropic' })),
}))

vi.mock('@/lib/memory/resolver', () => ({
  MemoryResolver: vi.fn().mockImplementation(() => ({
    getSessionSnapshot: vi.fn().mockResolvedValue({
      sessionCount: 1,
      kernMotivation: null,
      personalityPrefs: null,
      trainingPatterns: null,
      lifeContext: null,
    }),
  })),
}))

vi.mock('@/lib/coach/mode-selector', () => ({
  selectCoachMode: vi.fn(() => 'performance'),
  getModelForMode: vi.fn(() => 'claude-haiku-4-5-20251001'),
  shouldProbeMotivation: vi.fn(() => false),
}))

vi.mock('@/lib/physio/sensitivity-router', () => ({
  classifySensitivity: vi.fn(() => ({ level: 'normal', signals: [] })),
}))

vi.mock('@/lib/physio/context-loader', () => ({
  hasPhysioContext: vi.fn(() => false),
  loadPhysioContext: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/privacy/hooks', () => ({
  canExecuteTool: vi.fn(() => true),
}))

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        single: vi.fn().mockResolvedValue({ data: null }),
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: [] }),
        })),
      })),
    })),
  })),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runVoiceTurnOrchestration', () => {
  it('uses generateText from Vercel AI SDK and passes mode-selected model', async () => {
    const { generateText } = await import('ai')
    const { getModel } = await import('@/lib/ai/registry')
    const mockGenerateText = vi.mocked(generateText)

    mockGenerateText.mockResolvedValueOnce({
      text: 'Sehr gut, weiter so!',
      toolCalls: [],
      toolResults: [],
    } as any)

    const { runVoiceTurnOrchestration } = await import('./server-orchestrator')
    const result = await runVoiceTurnOrchestration(mockSupabase, {
      userId: 'test-user',
      messages: [{ role: 'user', content: 'Hallo' }],
    })

    expect(result.reply).toBe('Sehr gut, weiter so!')
    expect(result.llmLatencyMs).toBeGreaterThanOrEqual(0)
    expect(mockGenerateText).toHaveBeenCalledOnce()
    // Verify getModel was called with the mode-selected model
    expect(getModel).toHaveBeenCalledWith({ model: 'claude-haiku-4-5-20251001' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/voice/server-orchestrator.test.ts
```

Expected: FAIL — still uses `anthropic.messages.create`.

- [ ] **Step 3: Modify imports and non-streaming function**

In `lib/voice/server-orchestrator.ts`:

```typescript
// REMOVE these two imports:
// import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources/messages'
// import { anthropic } from '@/lib/claude/client'

// ADD:
import { generateText, streamText, type CoreTool } from 'ai'
import { getModel } from '@/lib/ai/registry'
import { z } from 'zod'
```

Replace `runVoiceTurnOrchestration`:

```typescript
export async function runVoiceTurnOrchestration(
  supabase: any,
  input: VoiceOrchestratorInput,
): Promise<VoiceOrchestratorResult> {
  const coachTurn = await resolveCoachTurn(input)
  const prompt = await buildVoiceOrchestrationPrompt(supabase, input, coachTurn)
  const llmStart = Date.now()

  const result = await generateText({
    model: getModel({ model: coachTurn.model }),
    system: prompt.system,
    messages: prompt.messages,
    tools: mapTools(input.tools),
    maxTokens: 300,
  })

  const content = result.text?.trim()
  if (!content) {
    throw new Error('No response text returned')
  }

  return {
    reply: content,
    llmLatencyMs: Math.max(0, Date.now() - llmStart),
  }
}
```

Replace `mapAnthropicTools` with a Vercel AI SDK-compatible mapper:

```typescript
function mapTools(tools?: ToolDefinition[]): Record<string, CoreTool> | undefined {
  if (!tools?.length) return undefined

  const mapped: Record<string, CoreTool> = {}
  for (const tool of tools) {
    mapped[tool.name] = {
      description: tool.description,
      parameters: z.object(
        Object.fromEntries(
          Object.entries(tool.input_schema.properties ?? {}).map(
            ([key, prop]: [string, any]) => [key, z.any().describe(prop.description ?? '')]
          )
        )
      ),
    }
  }
  return mapped
}
```

Delete the old `mapAnthropicTools`, `parseToolInput`, and `isRecord` helper functions (no longer needed — Vercel AI SDK handles tool input parsing).

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/voice/server-orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/server-orchestrator.ts lib/voice/server-orchestrator.test.ts
git commit -m "refactor: migrate voice orchestrator (non-streaming) to Vercel AI SDK"
```

---

### Task 6: Migrate voice orchestrator (streaming with tool calls)

**Files:**
- Modify: `lib/voice/server-orchestrator.ts`
- Update: `lib/voice/server-orchestrator.test.ts`

The streaming path must handle both text deltas AND tool call chunks. Vercel AI SDK exposes `result.fullStream` which yields all event types including tool calls.

- [ ] **Step 1: Add streaming tests — text-only and tool call scenarios**

```typescript
// Add to lib/voice/server-orchestrator.test.ts

describe('streamVoiceTurnOrchestration', () => {
  it('yields text delta chunks then done', async () => {
    const { streamText } = await import('ai')
    const mockStreamText = vi.mocked(streamText)

    // Mock fullStream as async iterable
    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Sehr ' }
      yield { type: 'text-delta', textDelta: 'gut!' }
      yield { type: 'finish', finishReason: 'stop' }
    })()

    mockStreamText.mockReturnValueOnce({
      fullStream: mockFullStream,
    } as any)

    const { streamVoiceTurnOrchestration } = await import('./server-orchestrator')
    const chunks: any[] = []

    for await (const chunk of streamVoiceTurnOrchestration(mockSupabase, {
      userId: 'test-user',
      messages: [{ role: 'user', content: 'Hallo' }],
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(3) // 2 deltas + 1 done
    expect(chunks[0]).toEqual({ type: 'delta', text: 'Sehr ' })
    expect(chunks[1]).toEqual({ type: 'delta', text: 'gut!' })
    expect(chunks[2].type).toBe('done')
    expect(chunks[2].reply).toBe('Sehr gut!')
  })

  it('yields tool_call chunks with privacy gating', async () => {
    const { streamText } = await import('ai')
    const { canExecuteTool } = await import('@/lib/privacy/hooks')
    const mockStreamText = vi.mocked(streamText)
    vi.mocked(canExecuteTool).mockReturnValue(true)

    const mockFullStream = (async function* () {
      yield {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'skip_exercise',
        args: { reason: 'too painful' },
      }
      yield { type: 'text-delta', textDelta: 'OK, wir ueberspringen das.' }
      yield { type: 'finish', finishReason: 'stop' }
    })()

    mockStreamText.mockReturnValueOnce({
      fullStream: mockFullStream,
    } as any)

    const { streamVoiceTurnOrchestration } = await import('./server-orchestrator')
    const chunks: any[] = []

    for await (const chunk of streamVoiceTurnOrchestration(mockSupabase, {
      userId: 'test-user',
      messages: [{ role: 'user', content: 'Das tut zu weh' }],
      tools: [{ name: 'skip_exercise', description: 'Skip current exercise', input_schema: { type: 'object', properties: { reason: { type: 'string' } } } }],
    })) {
      chunks.push(chunk)
    }

    const toolChunk = chunks.find(c => c.type === 'tool_call')
    expect(toolChunk).toEqual({ type: 'tool_call', name: 'skip_exercise', input: { reason: 'too painful' } })
    expect(canExecuteTool).toHaveBeenCalledWith('skip_exercise', 'normal')
  })

  it('blocks tool calls when privacy policy denies them', async () => {
    const { streamText } = await import('ai')
    const { canExecuteTool } = await import('@/lib/privacy/hooks')
    const mockStreamText = vi.mocked(streamText)
    vi.mocked(canExecuteTool).mockReturnValue(false)

    const mockFullStream = (async function* () {
      yield {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'modify_plan',
        args: {},
      }
      yield { type: 'finish', finishReason: 'stop' }
    })()

    mockStreamText.mockReturnValueOnce({
      fullStream: mockFullStream,
    } as any)

    const { streamVoiceTurnOrchestration } = await import('./server-orchestrator')
    const chunks: any[] = []

    for await (const chunk of streamVoiceTurnOrchestration(mockSupabase, {
      userId: 'test-user',
      messages: [{ role: 'user', content: 'Ändere den Plan' }],
      tools: [{ name: 'modify_plan', description: 'Modify plan', input_schema: { type: 'object', properties: {} } }],
    })) {
      chunks.push(chunk)
    }

    // Tool call should NOT appear — blocked by privacy
    expect(chunks.find(c => c.type === 'tool_call')).toBeUndefined()
    // Fallback text should be yielded instead
    const doneChunk = chunks.find(c => c.type === 'done')
    expect(doneChunk.reply).toContain('nicht weiter')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/voice/server-orchestrator.test.ts
```

Expected: FAIL on streaming tests.

- [ ] **Step 3: Rewrite streaming function using `fullStream`**

Replace `streamVoiceTurnOrchestration` in `lib/voice/server-orchestrator.ts`:

```typescript
export async function* streamVoiceTurnOrchestration(
  supabase: any,
  input: VoiceOrchestratorInput,
): AsyncGenerator<VoiceTurnStreamChunk> {
  const coachTurn = await resolveCoachTurn(input)
  const prompt = await buildVoiceOrchestrationPrompt(supabase, input, coachTurn)
  const llmStart = Date.now()

  const result = streamText({
    model: getModel({ model: coachTurn.model }),
    system: prompt.system,
    messages: prompt.messages,
    tools: mapTools(input.tools),
    maxTokens: 300,
  })

  let fullReply = ''
  let firstDeltaAt: number | null = null
  let sawToolCall = false
  let blockedToolFallback: string | null = null

  for await (const event of result.fullStream) {
    if (event.type === 'text-delta') {
      const text = event.textDelta
      if (!text) continue
      if (!firstDeltaAt) firstDeltaAt = Date.now()
      fullReply += text
      yield { type: 'delta', text }
    }

    if (event.type === 'tool-call') {
      if (canExecuteTool(event.toolName, coachTurn.sensitivity.level)) {
        sawToolCall = true
        yield {
          type: 'tool_call',
          name: event.toolName,
          input: event.args as Record<string, unknown>,
        }
      } else if (!blockedToolFallback) {
        blockedToolFallback = buildBlockedToolFallback(input.language)
      }
    }
  }

  let reply = fullReply.trim()
  if (!reply && !sawToolCall && blockedToolFallback) {
    reply = blockedToolFallback
    yield { type: 'delta', text: reply }
  }
  if (!reply && !sawToolCall) {
    throw new Error('No response text returned')
  }

  yield {
    type: 'done',
    reply,
    llmLatencyMs: firstDeltaAt ? Math.max(0, firstDeltaAt - llmStart) : Math.max(0, Date.now() - llmStart),
  }
}
```

This preserves all existing behavior:
- Tool calls are gated through `canExecuteTool()` with the sensitivity level
- Blocked tools trigger `buildBlockedToolFallback()` as a text fallback
- `coachTurn.model` is passed to `getModel()` for mode-based model selection

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/voice/server-orchestrator.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/server-orchestrator.ts lib/voice/server-orchestrator.test.ts
git commit -m "refactor: migrate voice orchestrator (streaming + tool calls) to Vercel AI SDK"
```

---

### Task 7: Remove old Anthropic SDK dependency

**Files:**
- Delete: `lib/claude/client.ts`
- Modify: `package.json`
- Verify: no remaining imports of `@anthropic-ai/sdk` or `lib/claude/client`

- [ ] **Step 1: Search for remaining Anthropic SDK usage**

```bash
grep -r "@anthropic-ai/sdk\|lib/claude/client" --include="*.ts" --include="*.tsx" app/ lib/
```

Expected: zero matches. Task 5 already removed the `import type { Tool as AnthropicTool }` and replaced `mapAnthropicTools()` with the new `mapTools()` function using Vercel AI SDK's `CoreTool` type. If any references remain, remove them now.

- [ ] **Step 2: Delete the old client singleton**

Delete `lib/claude/client.ts`.

- [ ] **Step 3: Uninstall old SDK**

```bash
npm uninstall @anthropic-ai/sdk
```

- [ ] **Step 4: Verify build**

```bash
npx next build
```

Expected: build succeeds with no import errors.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove @anthropic-ai/sdk, replaced by Vercel AI SDK"
```

---

## Chunk 2: Multi-Provider Support

Adds Azure OpenAI and Google Vertex AI as swappable providers.

### Task 8: Add Azure OpenAI provider

**Files:**
- Modify: `lib/ai/registry.ts`
- Update: `lib/ai/registry.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install Azure provider**

```bash
npm install @ai-sdk/azure
```

- [ ] **Step 2: Write failing test**

```typescript
// Add to lib/ai/registry.test.ts
it('returns azure-openai model when configured', async () => {
  vi.stubEnv('LLM_PROVIDER', 'azure-openai')
  vi.stubEnv('LLM_MODEL', 'gpt-4o')
  vi.stubEnv('AZURE_RESOURCE_NAME', 'my-resource')
  vi.stubEnv('AZURE_API_KEY', 'test-key')

  // Re-import to pick up new env
  vi.resetModules()
  const { getModel } = await import('./registry')
  const model = getModel()

  expect(model.modelId).toBe('gpt-4o')
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/ai/registry.test.ts
```

Expected: FAIL — `azure-openai` case throws "not yet configured".

- [ ] **Step 4: Implement Azure provider in registry**

```typescript
// Add to lib/ai/registry.ts imports:
import { createAzure } from '@ai-sdk/azure'

// Replace the azure-openai case:
case 'azure-openai': {
  const azure = createAzure({
    resourceName: process.env.AZURE_RESOURCE_NAME,
    apiKey: process.env.AZURE_API_KEY,
  })
  return azure(model)
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/ai/registry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update `.env.example`**

Add these lines:

```bash
# LLM Provider: 'anthropic' | 'azure-openai' | 'vertex'
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001

# Azure OpenAI (for EU-compliant demos)
# LLM_MODEL should match your Azure DEPLOYMENT NAME (not the underlying model name).
# E.g., if you deployed GPT-4o as "gpt-4o", set LLM_MODEL=gpt-4o.
AZURE_RESOURCE_NAME=
AZURE_API_KEY=
```

- [ ] **Step 7: Commit**

```bash
git add lib/ai/registry.ts lib/ai/registry.test.ts .env.example package.json package-lock.json
git commit -m "feat: add Azure OpenAI provider to model registry"
```

---

### Task 9: Add Google Vertex AI provider

**Files:**
- Modify: `lib/ai/registry.ts`
- Update: `lib/ai/registry.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install Vertex provider**

```bash
npm install @ai-sdk/google-vertex
```

- [ ] **Step 2: Write failing test**

```typescript
// Add to lib/ai/registry.test.ts
it('returns vertex model when configured', async () => {
  vi.stubEnv('LLM_PROVIDER', 'vertex')
  vi.stubEnv('LLM_MODEL', 'gemini-2.0-flash')
  vi.stubEnv('GOOGLE_VERTEX_PROJECT', 'my-project')
  vi.stubEnv('GOOGLE_VERTEX_LOCATION', 'europe-west4')

  vi.resetModules()
  const { getModel } = await import('./registry')
  const model = getModel()

  expect(model.modelId).toBe('gemini-2.0-flash')
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/ai/registry.test.ts
```

Expected: FAIL — `vertex` case throws "not yet configured".

- [ ] **Step 4: Implement Vertex provider in registry**

```typescript
// Add to lib/ai/registry.ts imports:
import { createVertex } from '@ai-sdk/google-vertex'

// Replace the vertex case:
case 'vertex': {
  const vertex = createVertex({
    project: process.env.GOOGLE_VERTEX_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION ?? 'europe-west4',
  })
  return vertex(model)
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/ai/registry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update `.env.example`**

Add:

```bash
# Google Vertex AI (EU-compliant Gemini)
GOOGLE_VERTEX_PROJECT=
GOOGLE_VERTEX_LOCATION=europe-west4
```

- [ ] **Step 7: Commit**

```bash
git add lib/ai/registry.ts lib/ai/registry.test.ts .env.example package.json package-lock.json
git commit -m "feat: add Google Vertex AI provider to model registry"
```

---

### Task 10: Per-route model override support

Allow individual API routes to use a different provider than the global default. For example: use Gemini Flash for plan generation (cheap) while keeping Claude for voice coaching (quality).

**Files:**
- Modify: `lib/ai/registry.ts`
- Update: `lib/ai/registry.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Add to lib/ai/registry.test.ts
describe('getModelForTask', () => {
  it('reads task-specific env var', async () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    vi.stubEnv('LLM_PROVIDER__PLAN_GENERATION', 'anthropic')
    vi.stubEnv('LLM_MODEL__PLAN_GENERATION', 'claude-sonnet-4-20250514')

    vi.resetModules()
    const { getModelForTask } = await import('./registry')
    const model = getModelForTask('PLAN_GENERATION')

    expect(model.modelId).toBe('claude-sonnet-4-20250514')
  })

  it('falls back to global default when no task override exists', async () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic')
    vi.stubEnv('LLM_MODEL', 'claude-haiku-4-5-20251001')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')

    vi.resetModules()
    const { getModelForTask } = await import('./registry')
    const model = getModelForTask('VOICE_COACHING')

    expect(model.modelId).toBe('claude-haiku-4-5-20251001')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/ai/registry.test.ts
```

Expected: FAIL — `getModelForTask` not exported.

- [ ] **Step 3: Implement getModelForTask**

```typescript
// Add to lib/ai/registry.ts:
type TaskName = 'PLAN_GENERATION' | 'FEEDBACK' | 'VOICE_COACHING'

export function getModelForTask(task: TaskName): LanguageModel {
  const taskProvider = process.env[`LLM_PROVIDER__${task}`] as ProviderName | undefined
  const taskModel = process.env[`LLM_MODEL__${task}`]

  if (taskProvider) {
    return getModel({ provider: taskProvider, model: taskModel ?? defaults[taskProvider] })
  }
  return getModel()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/ai/registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update API routes to use `getModelForTask`**

In each route, replace `getModel()` with the appropriate task:
- `generate-plan/route.ts` → `getModelForTask('PLAN_GENERATION')`
- `feedback/route.ts` → `getModelForTask('FEEDBACK')`
- `server-orchestrator.ts` → **keep `getModel({ model: coachTurn.model })`** — voice coaching uses dynamic mode-based model selection from `resolveCoachTurn()`, not a static env var override. The `getModelForTask` pattern does not apply here because the model is chosen per-turn based on safety/performance mode.

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/ai/registry.ts lib/ai/registry.test.ts app/api/generate-plan/route.ts app/api/feedback/route.ts lib/voice/server-orchestrator.ts
git commit -m "feat: add per-task model override via env vars"
```

---

## Chunk 3: RAG Demo Feature

Adds a demo page that showcases RAG with Azure Cognitive Search — for portfolio/client pitches.

### Task 11: Set up Azure Cognitive Search client

**Files:**
- Create: `lib/ai/search.ts`
- Create: `lib/ai/search.test.ts`

- [ ] **Step 1: Install Azure Search SDK**

```bash
npm install @azure/search-documents
```

- [ ] **Step 2: Write failing test**

```typescript
// lib/ai/search.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@azure/search-documents', () => ({
  SearchClient: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { document: { content: 'Test chunk about hydraulic systems', title: 'Manual Section 3', id: '1' } }
        yield { document: { content: 'Maintenance schedule for pumps', title: 'Manual Section 7', id: '2' } }
      },
    }),
  })),
  AzureKeyCredential: vi.fn().mockImplementation((key: string) => ({ key })),
}))

describe('searchDocuments', () => {
  it('returns formatted search results', async () => {
    vi.stubEnv('AZURE_SEARCH_ENDPOINT', 'https://test.search.windows.net')
    vi.stubEnv('AZURE_SEARCH_KEY', 'test-key')
    vi.stubEnv('AZURE_SEARCH_INDEX', 'demo-docs')

    const { searchDocuments } = await import('./search')
    const results = await searchDocuments('How do I maintain hydraulic pumps?')

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      content: expect.stringContaining('hydraulic'),
      title: 'Manual Section 3',
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run lib/ai/search.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation**

```typescript
// lib/ai/search.ts
import { SearchClient, AzureKeyCredential } from '@azure/search-documents'

interface SearchResult {
  id: string
  content: string
  title: string
}

export async function searchDocuments(query: string, topK = 3): Promise<SearchResult[]> {
  const client = new SearchClient(
    process.env.AZURE_SEARCH_ENDPOINT!,
    process.env.AZURE_SEARCH_INDEX!,
    new AzureKeyCredential(process.env.AZURE_SEARCH_KEY!),
  )

  const results: SearchResult[] = []
  // Note: Azure Cognitive Search free tier does NOT support semantic search.
  // Using simple full-text search here. Upgrade to Standard SKU for semantic ranking.
  const searchResults = await client.search(query, {
    top: topK,
  })

  for await (const result of searchResults.results) {
    const doc = result.document as any
    results.push({
      id: doc.id,
      content: doc.content,
      title: doc.title,
    })
  }

  return results
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/ai/search.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/search.ts lib/ai/search.test.ts package.json package-lock.json
git commit -m "feat: add Azure Cognitive Search client for RAG retrieval"
```

---

### Task 12: Create RAG API route

**Files:**
- Create: `app/api/demo/rag/route.ts`
- Create: `app/api/demo/rag/route.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// app/api/demo/rag/route.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  streamText: vi.fn(),
}))

vi.mock('@/lib/ai/registry', () => ({
  getModel: vi.fn(() => ({ modelId: 'test-model', provider: 'test' })),
}))

vi.mock('@/lib/ai/search', () => ({
  searchDocuments: vi.fn().mockResolvedValue([
    { id: '1', content: 'Hydraulic pump maintenance requires monthly filter changes.', title: 'Section 3' },
  ]),
}))

describe('RAG demo route', () => {
  it('retrieves documents and streams LLM response', async () => {
    const { streamText } = await import('ai')
    const mockStreamText = vi.mocked(streamText)

    mockStreamText.mockReturnValueOnce({
      toTextStreamResponse: vi.fn(() => new Response('streamed')),
    } as any)

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/demo/rag', {
      method: 'POST',
      body: JSON.stringify({ question: 'How often should I change the filter?' }),
    })

    const response = await POST(request)
    expect(response).toBeDefined()

    const { searchDocuments } = await import('@/lib/ai/search')
    expect(searchDocuments).toHaveBeenCalledWith('How often should I change the filter?')
    expect(mockStreamText).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run app/api/demo/rag/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write route implementation**

```typescript
// app/api/demo/rag/route.ts
import { streamText } from 'ai'
import { getModel } from '@/lib/ai/registry'
import { searchDocuments } from '@/lib/ai/search'

export async function POST(request: Request) {
  const { question } = await request.json()

  if (!question || typeof question !== 'string') {
    return Response.json({ error: 'question is required' }, { status: 400 })
  }

  const sources = await searchDocuments(question)

  const context = sources
    .map((s, i) => `[Source ${i + 1}: ${s.title}]\n${s.content}`)
    .join('\n\n')

  const result = streamText({
    model: getModel(),
    system: `You are a technical assistant for industrial machinery documentation.
Answer questions based ONLY on the provided context. If the context doesn't contain
the answer, say so. Always cite your sources using [Source N] notation.

Context:
${context}`,
    messages: [{ role: 'user', content: question }],
    maxTokens: 1024,
  })

  // Use toTextStreamResponse() (not toDataStreamResponse) so the client
  // can read raw text without parsing the Vercel AI SDK data stream protocol.
  // Sources are passed via header since the stream is plain text.
  return result.toTextStreamResponse({
    headers: {
      'X-Sources': JSON.stringify(sources.map(s => ({ id: s.id, title: s.title }))),
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/demo/rag/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/demo/rag/route.ts app/api/demo/rag/route.test.ts
git commit -m "feat: add RAG demo API route with Azure Search retrieval"
```

---

### Task 13: Create document ingestion script

**Files:**
- Create: `scripts/ingest-documents.ts`
- Create: `docs/demo-data/sample-manual.md` (sample industrial document)

- [ ] **Step 1: Create sample document**

```markdown
<!-- docs/demo-data/sample-manual.md -->
# Hydraulikpumpe HP-3000 — Betriebsanleitung

## 1. Sicherheitshinweise
Die Hydraulikpumpe HP-3000 darf nur von geschultem Fachpersonal bedient werden.
Vor Wartungsarbeiten ist die Anlage drucklos zu schalten und gegen Wiedereinschalten zu sichern.

## 2. Technische Daten
- Betriebsdruck: max. 350 bar
- Fördervolumen: 45 l/min
- Betriebstemperatur: -20°C bis +80°C
- Gewicht: 28 kg

## 3. Wartung
### 3.1 Monatliche Wartung
- Ölstand prüfen und bei Bedarf nachfüllen (Hydrauliköl HLP 46)
- Filterelemente auf Verschmutzung prüfen
- Dichtungen visuell kontrollieren

### 3.2 Vierteljährliche Wartung
- Filterelemente wechseln
- Ölanalyse durchführen lassen
- Schlauchverbindungen auf Leckage prüfen

### 3.3 Jährliche Wartung
- Kompletter Ölwechsel (Füllmenge: 12 Liter HLP 46)
- Druckventile prüfen und kalibrieren
- Pumpengehäuse auf Risse inspizieren

## 4. Fehlerbehebung
| Symptom | Mögliche Ursache | Maßnahme |
|---------|-------------------|----------|
| Druckabfall | Verschlissene Dichtung | Dichtungssatz tauschen |
| Überhitzung | Ölstand zu niedrig | Öl nachfüllen |
| Laufgeräusche | Kavitation | Saugleitung prüfen |
| Leckage am Gehäuse | Gehäuseriss | Pumpe austauschen |
```

- [ ] **Step 2: Write ingestion script**

```typescript
// scripts/ingest-documents.ts
import { readFileSync } from 'fs'
import { SearchClient, SearchIndexClient, AzureKeyCredential } from '@azure/search-documents'

const CHUNK_SIZE = 500 // characters per chunk
const CHUNK_OVERLAP = 100

function chunkText(text: string, title: string): Array<{ id: string; content: string; title: string }> {
  const chunks: Array<{ id: string; content: string; title: string }> = []
  let start = 0
  let index = 0

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    chunks.push({
      id: `${title.replace(/\s+/g, '-').toLowerCase()}-${index}`,
      content: text.slice(start, end),
      title,
    })
    start = end - CHUNK_OVERLAP
    index++
  }

  return chunks
}

async function main() {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT!
  const apiKey = process.env.AZURE_SEARCH_KEY!
  const indexName = process.env.AZURE_SEARCH_INDEX ?? 'demo-docs'

  const credential = new AzureKeyCredential(apiKey)

  // Create index if it doesn't exist
  const indexClient = new SearchIndexClient(endpoint, credential)

  try {
    await indexClient.getIndex(indexName)
    console.log(`Index "${indexName}" already exists.`)
  } catch {
    console.log(`Creating index "${indexName}"...`)
    await indexClient.createIndex({
      name: indexName,
      fields: [
        { name: 'id', type: 'Edm.String', key: true, filterable: true },
        { name: 'content', type: 'Edm.String', searchable: true },
        { name: 'title', type: 'Edm.String', searchable: true, filterable: true },
      ],
    })
  }

  // Read and chunk documents
  const docPath = 'docs/demo-data/sample-manual.md'
  const text = readFileSync(docPath, 'utf-8')
  const chunks = chunkText(text, 'HP-3000 Betriebsanleitung')

  console.log(`Chunked into ${chunks.length} pieces.`)

  // Upload chunks
  const searchClient = new SearchClient(endpoint, indexName, credential)
  const result = await searchClient.uploadDocuments(chunks)
  console.log(`Uploaded ${result.results.length} chunks.`)
}

main().catch(console.error)
```

- [ ] **Step 3: Add script to package.json**

```json
"scripts": {
  "ingest": "npx tsx scripts/ingest-documents.ts"
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest-documents.ts docs/demo-data/sample-manual.md package.json
git commit -m "feat: add document ingestion script and sample industrial manual"
```

---

### Task 14: Create RAG demo UI page

**Files:**
- Create: `app/demo/rag/page.tsx`

- [ ] **Step 1: Create demo page**

This is a standalone demo page — not part of the main PhysioBot user flow. It should be visually distinct (clean, minimal, enterprise-looking) to serve as a portfolio piece.

```tsx
// app/demo/rag/page.tsx
'use client'

import { useState, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ id: string; title: string }>
}

export default function RAGDemoPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const res = await fetch('/api/demo/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      const sources = JSON.parse(res.headers.get('X-Sources') ?? '[]')
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let content = ''

      setMessages(prev => [...prev, { role: 'assistant', content: '', sources }])

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          content += decoder.decode(value, { stream: true })
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content, sources }
            return updated
          })
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not process your question.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-xl font-semibold">Enterprise RAG Demo</h1>
        <p className="text-sm text-slate-500">
          EU-compliant AI document retrieval — Azure OpenAI + Cognitive Search
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`rounded-lg p-4 ${
              msg.role === 'user'
                ? 'bg-blue-50 ml-12'
                : 'bg-white border shadow-sm mr-12'
            }`}>
              <p className="text-sm font-medium text-slate-500 mb-1">
                {msg.role === 'user' ? 'You' : 'AI Assistant'}
              </p>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs font-medium text-slate-400 mb-1">Sources:</p>
                  {msg.sources.map((s, j) => (
                    <span key={j} className="inline-block text-xs bg-slate-100 rounded px-2 py-1 mr-2">
                      {s.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a question about the technical documentation..."
            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '...' : 'Ask'}
          </button>
        </form>

        <div className="mt-8 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <strong>Compliance info:</strong> All data processed within Azure EU region
          (Germany West Central). No data used for model training. GDPR-compliant data processing.
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify page renders locally**

```bash
npm run dev
# Visit http://localhost:3000/demo/rag
```

Expected: page renders with input field and compliance banner.

- [ ] **Step 3: Commit**

```bash
git add app/demo/rag/page.tsx
git commit -m "feat: add RAG demo UI page for enterprise portfolio"
```

---

## Chunk 4: Infrastructure & Compliance

### Task 15: Update environment configuration

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add all new env vars to `.env.example`**

Final `.env.example` should contain:

```bash
# --- Supabase (existing) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# --- LLM Provider ---
# Global default: 'anthropic' | 'azure-openai' | 'vertex'
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001

# Per-task overrides (optional):
# LLM_PROVIDER__PLAN_GENERATION=vertex
# LLM_MODEL__PLAN_GENERATION=gemini-2.0-flash
# LLM_PROVIDER__FEEDBACK=anthropic
# LLM_PROVIDER__VOICE_COACHING=anthropic

# --- Anthropic ---
ANTHROPIC_API_KEY=

# --- Azure OpenAI (EU-compliant demos) ---
# When using azure-openai provider, LLM_MODEL must match your Azure DEPLOYMENT name.
AZURE_RESOURCE_NAME=
AZURE_API_KEY=

# --- Google Vertex AI (EU-compliant, cost-effective) ---
GOOGLE_VERTEX_PROJECT=
GOOGLE_VERTEX_LOCATION=europe-west4

# --- Azure Cognitive Search (RAG demo) ---
AZURE_SEARCH_ENDPOINT=
AZURE_SEARCH_KEY=
AZURE_SEARCH_INDEX=demo-docs

# --- Voice (existing) ---
NEXT_PUBLIC_VOICE_PROVIDER=browser
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# --- Memory (existing) ---
MEM0_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with all LLM provider config"
```

---

### Task 16: Write ADR for multi-provider LLM architecture

**Files:**
- Create: `docs/adr/0007-multi-provider-llm-architecture.md`

- [ ] **Step 1: Write ADR**

```markdown
# ADR-0007: Multi-Provider LLM Architecture

**Status:** Accepted
**Date:** 2026-03-16
**Deciders:** Sebastian

## Context

PhysioBot needs to demonstrate EU-compliant AI architecture for consulting pitches
to German industrial clients. Direct Anthropic API usage lacks EU data residency guarantees.
Additionally, using multiple LLM providers enables cost optimization and vendor flexibility.

## Decision

Adopt Vercel AI SDK as a unified LLM abstraction layer with three providers:

1. **Anthropic** (direct API) — default for development
2. **Azure OpenAI Service** — EU-hosted (Germany West Central) for compliance demos
3. **Google Vertex AI** — EU-hosted (europe-west4) for cost-effective Gemini models

Provider selection is controlled via environment variables (`LLM_PROVIDER`, `LLM_MODEL`)
with per-task overrides (`LLM_PROVIDER__VOICE_COACHING`, etc.).

## Consequences

- All LLM calls go through `lib/ai/registry.ts` — single point of configuration
- Provider swap is an env var change, no code changes needed
- Azure OpenAI and Vertex AI provide EU data residency + no-training-on-data guarantees
- `@anthropic-ai/sdk` is removed; Anthropic access goes through `@ai-sdk/anthropic`
- Plan generation and feedback routes use `generateObject` with Zod schemas (structured output)
- Voice streaming uses `streamText` (cleaner than raw Anthropic SDK event parsing)
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0007-multi-provider-llm-architecture.md
git commit -m "docs: add ADR-0007 multi-provider LLM architecture"
```

---

### Task 17: Azure infrastructure setup guide

**Files:**
- Create: `docs/architecture/azure-setup.md`

- [ ] **Step 1: Write setup guide**

```markdown
# Azure Infrastructure Setup

## Prerequisites

- Fresh Azure account (12-month free tier)
- Azure CLI installed: `brew install azure-cli`

## 1. Create Resource Group

```bash
az login
az group create --name physiobot-demo --location germanywestcentral
```

## 2. Provision Azure OpenAI

```bash
az cognitiveservices account create \
  --name physiobot-openai \
  --resource-group physiobot-demo \
  --kind OpenAI \
  --sku S0 \
  --location swedencentral \
  --custom-domain physiobot-openai

# Deploy GPT-4o model
az cognitiveservices account deployment create \
  --name physiobot-openai \
  --resource-group physiobot-demo \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version "2024-11-20" \
  --model-format OpenAI \
  --sku-name Standard \
  --sku-capacity 10
```

Note: Azure OpenAI is available in swedencentral (closest EU region with availability).
Data processing stays within EU. Check current region availability at
https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models

## 3. Provision Azure Cognitive Search (Free Tier)

```bash
az search service create \
  --name physiobot-search \
  --resource-group physiobot-demo \
  --sku free \
  --location germanywestcentral
```

## 4. Get Connection Details

```bash
# Azure OpenAI
az cognitiveservices account keys list \
  --name physiobot-openai \
  --resource-group physiobot-demo

# Azure Cognitive Search
az search admin-key show \
  --service-name physiobot-search \
  --resource-group physiobot-demo
```

## 5. Configure Environment

```bash
AZURE_RESOURCE_NAME=physiobot-openai
AZURE_API_KEY=<key from step 4>
AZURE_SEARCH_ENDPOINT=https://physiobot-search.search.windows.net
AZURE_SEARCH_KEY=<key from step 4>
AZURE_SEARCH_INDEX=demo-docs
```

## 6. Ingest Demo Documents

```bash
npm run ingest
```

## 7. Test

Switch to Azure provider and verify:

```bash
LLM_PROVIDER=azure-openai LLM_MODEL=gpt-4o npm run dev
# Visit /demo/rag and ask a question
```

## Cost Control

- Azure OpenAI: ~€5-10/month with light demo usage (pay per token)
- Cognitive Search free tier: 3 indexes, 50MB storage, no cost
- Total: well within €20/month cap
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/azure-setup.md
git commit -m "docs: add Azure infrastructure setup guide"
```

---

### Task 18: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Test Anthropic provider (default)**

```bash
npm run dev
# Test plan generation, feedback, voice coaching — all should work as before
```

- [ ] **Step 3: Test Azure provider (if Azure is provisioned)**

```bash
# Set env vars, restart dev server
LLM_PROVIDER=azure-openai LLM_MODEL=gpt-4o npm run dev
# Test /demo/rag page
```

- [ ] **Step 4: Build check**

```bash
npx next build
```

Expected: build succeeds.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve issues found during e2e verification"
```

---

## File Map Summary

| File | Action | Purpose |
|---|---|---|
| `lib/ai/registry.ts` | Create | Model registry — resolves provider + model from env |
| `lib/ai/registry.test.ts` | Create | Tests for registry |
| `lib/ai/search.ts` | Create | Azure Cognitive Search client |
| `lib/ai/search.test.ts` | Create | Tests for search client |
| `lib/claude/client.ts` | Delete | Replaced by registry |
| `lib/claude/prompts.ts` | Keep | Prompts stay unchanged |
| `lib/claude/extract-json.ts` | Keep | May still be used elsewhere; `generateObject` replaces it for plan/feedback routes |
| `app/api/generate-plan/route.ts` | Modify | Use `generateObject` + registry |
| `app/api/generate-plan/route.test.ts` | Create | Test for migrated route |
| `app/api/feedback/route.ts` | Modify | Use `generateObject` + registry |
| `app/api/feedback/route.test.ts` | Create | Test for migrated route |
| `lib/voice/server-orchestrator.ts` | Modify | Use `generateText`/`streamText` + registry |
| `lib/voice/server-orchestrator.test.ts` | Create | Tests for migrated orchestrator |
| `app/api/demo/rag/route.ts` | Create | RAG demo endpoint |
| `app/api/demo/rag/route.test.ts` | Create | Test for RAG route |
| `app/demo/rag/page.tsx` | Create | RAG demo UI |
| `scripts/ingest-documents.ts` | Create | Document chunking + Azure Search upload |
| `docs/demo-data/sample-manual.md` | Create | Sample German industrial manual |
| `docs/adr/0007-multi-provider-llm-architecture.md` | Create | Architecture decision record |
| `docs/architecture/azure-setup.md` | Create | Azure provisioning guide |
| `.env.example` | Modify | Add all new env vars |
