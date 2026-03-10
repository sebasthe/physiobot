# Voice V3 — Staged Implementation Design

> Consolidated design for the next generation of PhysioBot's voice coaching system.
> Replaces the scattered planning across `docs/plans/fitness-voice-coach-codex-v2/` and earlier voice architecture docs.

## Context

### What exists today (Sprint 1+2, shipped)

- Dual STT: ElevenLabs realtime WebSocket + browser Web Speech API fallback
- Dual TTS: ElevenLabs streaming + browser fallback
- Server-side Claude orchestration (Haiku) with basic Mem0 memory
- Streaming pipeline (SSE), interrupt handling, silence backchannel
- Status state machine: `bereit` → `hoert_zu` → `versteht` → `antwortet`
- Manual mic toggle, hands-free continuous listening loop
- Telemetry logging to Supabase
- All voice logic lives in `lib/voice/`, API routes in `app/api/voice/`, UI in `components/training/SessionPlayer.tsx` (891 lines)

### What's wrong

- `SessionPlayer.tsx` is a monolith — voice I/O, turn management, exercise progression, UI all tangled
- Voice logic is not reusable for other apps
- Coach can talk but can't act — no tool-based workout control
- No formal coaching modes or personality adaptation
- Memory is basic — no structured extraction, no read-path optimization
- No privacy controls, no data classification
- No utterance classification (every sound triggers a full LLM turn)

### Design principles

1. **Fixed plan assumption** — a plan exists (created by user, therapist, or external service). The voice agent executes it, never modifies it.
2. **Same-stack reusable** — voice module is a clean Next.js/React module. Easy to copy into another Next.js app. No npm package overhead.
3. **Each stage leaves the app functional** — no broken intermediate states. Each branch merges only when complete and tested.
4. **Physio is the destination, fitness is the start** — regulatory simplicity first, medical expansion last.
5. **Don't over-architect** — utilities and middleware over services and frameworks.

### Superseded documents

The following docs are superseded by this design:

| Document | Status |
|---|---|
| `docs/plans/2026-03-04-voice-architecture-design.md` | Superseded (VoicePlayer pre-generation approach) |
| `docs/plans/2026-03-04-voice-architecture.md` | Superseded (VoicePlayer implementation plan) |
| `docs/plans/2026-03-09-realtime-voice-sprints.md` | Current state reference (what's built), no longer a forward plan |
| `docs/plans/fitness-voice-coach-codex-v2/01-backlog-prioritized.md` | Superseded by this staging |
| `docs/plans/fitness-voice-coach-codex-v2/02-architecture.md` | Superseded — target architecture was never adopted |
| `docs/plans/fitness-voice-coach-codex-v2/03-implementation-plan.md` | Superseded by this staging |
| `docs/plans/fitness-voice-coach-codex-v2/04-codex-source-inputs.md` | Process doc, still useful as reference |
| `docs/plans/fitness-voice-coach-codex-v2/05-user-stories.md` | Still valid as requirements input |
| `docs/plans/fitness-voice-coach-codex-v2/06-privacy-gdpr.md` | Still valid, feeds into Stage 4 |
| `docs/plans/fitness-voice-coach-codex-v2/07-data-classification-retention.md` | Still valid, feeds into Stage 4 |
| `docs/plans/fitness-voice-coach-codex-v2/08-target-repo-structure.md` | Superseded — monorepo structure was never adopted |

---

## Stage 1: Voice Module Extraction + Tool Control

**Branch:** `feature/voice-v3-foundation`

### Goal

Extract reusable voice I/O from SessionPlayer into a clean module. Add tool-based app control so the coach can drive workouts.

### Module structure

```
lib/voice-module/
├── core/
│   ├── VoiceSession.ts          # Main orchestrator: lifecycle, state machine
│   ├── TurnManager.ts           # Turn-taking, interrupt handling, streaming
│   ├── types.ts                 # Shared interfaces (VoiceConfig, TurnState, etc.)
│   └── events.ts                # Event emitter for voice lifecycle events
├── providers/
│   ├── stt/
│   │   ├── STTProvider.ts       # Interface
│   │   ├── ElevenLabsSTT.ts     # Realtime WebSocket STT
│   │   └── BrowserSTT.ts        # Web Speech API fallback
│   ├── tts/
│   │   ├── TTSProvider.ts       # Interface
│   │   ├── ElevenLabsTTS.ts     # Streaming TTS
│   │   └── BrowserTTS.ts        # Web Speech API fallback
│   └── llm/
│       └── LLMProvider.ts       # Interface for turn orchestration
├── react/
│   ├── useVoiceSession.ts       # React hook wrapping VoiceSession
│   ├── VoiceStatusIndicator.tsx  # Reusable status UI component
│   └── TranscriptView.tsx       # Reusable transcript display
└── index.ts                     # Public API
```

### Key interfaces

```typescript
interface VoiceConfig {
  stt: 'elevenlabs' | 'browser' | 'none'
  tts: 'elevenlabs' | 'browser'
  llmEndpoint: string
  autoListen: boolean
  language: string  // 'de-DE'
}

interface TurnContext {
  systemPrompt: string
  tools?: ToolDefinition[]
  metadata?: Record<string, unknown>
}

interface ToolDefinition {
  name: string
  description: string
  input_schema: JSONSchema
}

// LLM provider abstraction — allows model selection per turn (used in Stage 2)
interface LLMProvider {
  streamTurn(context: TurnContext, model?: string): AsyncIterable<StreamChunk>
}

type StreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'done'; reply: string; llmLatencyMs: number; totalLatencyMs: number }
```

### Workout state model

The canonical state that all tool calls operate on. This is the source of truth for the session.

```typescript
interface WorkoutState {
  sessionId: string
  status: 'active' | 'paused' | 'completed'
  exercises: ExerciseState[]
  currentExerciseIndex: number
  startedAt: string
}

interface ExerciseState {
  id: string
  name: string
  phase: 'warmup' | 'main' | 'cooldown'
  type: 'timed' | 'reps'
  targetDuration?: number         // seconds (for timed)
  targetSets?: number             // (for reps)
  targetReps?: number             // per set (for reps)
  completedSets: number
  remainingSeconds?: number       // current timer value
  status: 'pending' | 'active' | 'completed' | 'skipped'
}
```

Tool calls are validated against this state — e.g., `next_exercise` is only valid when the current exercise is `completed` or `skipped`, `mark_set_complete` is only valid when the current exercise is `active` and of type `reps`. Invalid tool calls are rejected with an error message the coach can relay.

### Tool control

The server orchestrator gains Claude `tool_use` support.

| Tool | Description | Effect |
|---|---|---|
| `next_exercise` | Advance to next exercise | Updates exercise index, validates current is done |
| `previous_exercise` | Go back one exercise | Updates exercise index |
| `pause_workout` | Pause current timer | Pauses timer, status → paused |
| `resume_workout` | Resume paused workout | Resumes timer, status → active |
| `mark_set_complete` | Mark current set done | Increments set counter |
| `adjust_timer` | Change remaining time | Modifies timer value (±seconds) |
| `end_session` | End the workout early | Triggers completion flow |

**Intentionally omitted tools:** `get_current_workout_state` is unnecessary because `WorkoutState` is injected into `TurnContext.metadata` on every turn. `repeat_instruction` is handled conversationally. `adjust_intensity` is deferred to Stage 5 (physio context).

When Claude returns a `tool_use` block, the server streams it as `{ type: 'tool_call', name, input }` via SSE. The client `VoiceSession` emits a `tool_call` event. The domain adapter (SessionPlayer) handles it.

**Note:** Stage 1 uses a single static system prompt. Mode-based prompt injection (Performance/Guidance/Safety) is introduced in Stage 2.

### SessionPlayer refactor

891 lines → ~200 lines. Becomes a thin domain adapter:

```
SessionPlayer (domain layer)
  └── useVoiceSession (hook)
       └── VoiceSession (core — state machine, turn management)
            ├── STTProvider (audio input)
            ├── TTSProvider (audio output)
            └── LLMProvider (turn orchestration)
```

SessionPlayer only handles: exercise progression, tool call execution, UI layout, injecting PhysioBot-specific TurnContext per turn.

---

## Stage 2: Coach Intelligence

**Branch:** `feature/voice-v3-coach-brain`

### Goal

Make the coach smart — formal coaching modes, motivation engine, structured memory with a proper read path, and per-context model selection.

### Coach policy system

Three modes, selected by the server orchestrator based on exercise phase and user utterance:

| Mode | When | Behavior |
|---|---|---|
| **Performance** | Active sets/reps | Short, punchy cues. No explanations. |
| **Guidance** | Rest periods, between exercises | Technique tips, form corrections, encouragement. |
| **Safety** | Pain reported, fatigue signals | Stop exercise, clarify, suggest modifications. Never push through. |

Mode is injected into the system prompt — not a separate LLM call.

### Model selection per context

| Context | Model | Rationale |
|---|---|---|
| Performance mode | Haiku | Fast, cheap, short cues |
| Guidance mode | Haiku | Good enough for technique tips |
| Safety mode | Sonnet | Needs nuance and careful reasoning |
| Motivation probing (Five Whys) | Sonnet | Empathy, deeper conversation quality |
| Memory extraction (post-session) | Sonnet | Accurate insight extraction |

Simple config map in the orchestrator. The `LLMProvider` interface from Stage 1 abstracts the endpoint.

### Motivation engine (Five Whys)

- Gated to rest periods in sessions 1-3
- Coach probes deeper motivation through structured dialogue
- Runs on Sonnet for conversational quality
- Extracted core motivation stored via Mem0 as structured data

**Motivation drop detection:** Beyond active probing, the coach detects low motivation from signals like: short acknowledgment-only turns over several exchanges, declining set completion rate, explicit statements ("Ich hab keinen Bock mehr"). Interventions: reference core motivation, adjust encouragement style, suggest shortening the session — never guilt or pressure.

**Note:** The Codex v2 "Strategy Builder" (P1.3) is intentionally deferred. The simpler `CoachingMemorySnapshot` approach covers the immediate need. A versioned, confidence-scored coaching profile can evolve from this foundation later if needed.

### Structured memory extraction

Post-session async pipeline:

```
Session transcript
  → Claude (Sonnet) extracts structured insights:
     - motivation_hints: string[]
     - personality_preferences: { communicationStyle, encouragementType }
     - training_patterns: { knownPainPoints, preferredExercises, fatigueSignals }
     - life_context: string[]
  → Selective write to Mem0 (only high-value, stable insights)
```

### Memory read path (MemoryResolver)

Introduced in this stage. Single place that reads, structures, and formats memories for the coach.

```typescript
interface CoachingMemorySnapshot {
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

Flow:

```
Session start
  → MemoryResolver.getSessionSnapshot(userId)
    → Mem0 query (all user memories)
    → Structure into CoachingMemorySnapshot
    → Cache for session duration

Per turn
  → Server orchestrator builds prompt:
      system = coachPolicy(mode)
             + memorySnapshot (cached)
             + exerciseContext (from client)
             + conversationHistory
```

Stage 4 later wraps MemoryResolver with privacy filtering.

### Mixed control UX

- Voice triggers tool calls → server returns `tool_call` → client executes
- Click triggers UI action → client executes + informs voice session
- Conflict resolution: if user clicks while coach speaks, coach acknowledges and adapts
- `ActionBus` coordinates: both voice tools and UI clicks publish to the same bus. This is the same event emitter from Stage 1 (`events.ts`), extended with a `{ source: 'voice' | 'ui', action: string, payload: unknown }` schema. The voice module emits tool-call actions; the UI emits click actions. SessionPlayer subscribes to both and updates `WorkoutState` through a single code path.

---

## Stage 3: Robustness & Quality

**Branch:** `feature/voice-v3-hardening`

### Goal

Make it reliable — utterance classification, edge case handling, observability, performance budgets.

### Utterance classification

Lightweight Haiku classifier before the full LLM turn:

| Category | Examples | Action |
|---|---|---|
| **Command** | "Nächste Übung", "Pause" | Direct tool execution, skip full turn |
| **Question** | "Wie mache ich das richtig?" | Full turn, Guidance mode |
| **Feedback** | "Das tut weh", "Zu schwer" | Full turn, Safety mode |
| **Filler/noise** | "Ähm", cough, background | Ignore |
| **Acknowledgment** | "Ok", "Ja" | Short confirmation, no full turn |

Commands with high confidence skip LLM entirely → straight to tool execution.

### Edge case handling

| Scenario | Upgrade |
|---|---|
| Rapid-fire interrupts | Debounce + queue, don't drop context |
| Network drop mid-turn | Detect timeout, browser TTS fallback with "Moment bitte" |
| Long silence (>30s) | Escalating: nudge → "Alles ok?" → pause workout |
| STT garbage | Confidence threshold, ask to repeat below threshold |
| TTS queue backup | Max queue depth, drop oldest if behind |

### Observability

Built on existing `voice_telemetry_events` table:

- **Turn metrics**: STT latency, classification latency, LLM latency (first token + total), TTS latency
- **Quality signals**: interrupt rate, fallback rate, STT confidence distribution
- **Session health**: turns per session, avg turn time, error count
- **Dashboard**: simple admin page at `/admin/voice-metrics`

### Performance budgets

| Segment | Target | Fallback |
|---|---|---|
| STT → classification | <200ms | Skip classification, full turn |
| Classification → first TTS | <800ms (Haiku), <1500ms (Sonnet) | Browser TTS |
| Total turn time | <1.5s typical | Filler audio if >2s |

---

## Stage 4: Privacy & Compliance

**Branch:** `feature/voice-v3-privacy`

### Goal

Data classification, retention policies, privacy hooks, user controls. Gate before physio expansion.

### Data classification

| Class | What | Examples | Retention |
|---|---|---|---|
| **A — Operational** | App mechanics | Turn latency, error logs, exercise IDs | 90 days |
| **B — Personal coaching** | Non-sensitive personal | Preferred exercises, communication style | Until user deletes |
| **C — Sensitive wellness** | Health-adjacent | Core motivation, fatigue patterns, stress mentions | Until user deletes, exportable |
| **D — Medical/rehab** | Medical data (Stage 5 only) | Pain levels, diagnoses, rehab protocols | Strict retention, audit logged |

Stage 4 implements Classes A-C. Class D deferred to Stage 5.

### What gets classified

- **Mem0 memories** — `data_class` field added at extraction time
- **Telemetry events** — Class A by default
- **Transcripts** — ephemeral, sessionStorage only, cleared on session end
- **Audio** — never stored, streamed and discarded

### Privacy hooks

```typescript
// Before writing to Mem0
canStoreMemory(memory: ExtractedInsight): boolean

// Before logging telemetry
shouldRedactLog(event: TelemetryEvent): TelemetryEvent

// Before reading memories (wraps MemoryResolver from Stage 2)
canRetrieveMemory(memory: MemoryEntry, userConsent: ConsentLevel): boolean

// Before executing a tool (gates tool actions by sensitivity/consent — used primarily in Stage 5)
canExecuteTool(toolName: string, sensitivityLevel: string): boolean

// Retention enforcement (cron or on-login)
enforceRetention(userId: string): void
```

**Infrastructure note:** Encryption in transit (TLS) and at rest is handled by the infrastructure layer (Supabase RLS + TLS, Vercel edge). No application-level encryption needed.

### User-facing controls (Settings page)

- **Memory view** — see what the coach remembers (Mem0 entries, human-readable)
- **Memory reset** — clear all coaching memories
- **Data export** — download all personal data as JSON
- **Account deletion** — cascading delete of all user data

### Implementation approach

- Classification is metadata — `data_class` column on Mem0 entries and telemetry
- Privacy hooks are utility functions in `lib/privacy/`
- `canRetrieveMemory` wraps the existing MemoryResolver from Stage 2
- Settings UI extends existing SettingsClient component

---

## Stage 5: Physio/Medical Expansion

**Branch:** `feature/voice-v3-physio`

### Goal

Rehab-aware coaching with medical safety boundaries. The real destination of the app.

### Sensitivity-aware content routing

Classification step on every turn in physio mode:

| Signal | Example | Action |
|---|---|---|
| Pain with specifics | "Stechender Schmerz im rechten Knie seit 2 Wochen" | Safety mode, Sonnet, flag Class D |
| Diagnosis mention | "Bandscheibenvorfall diagnostiziert" | Acknowledge, Class D memory, adapt |
| Medication reference | "Ich nehme Ibuprofen" | Note in Class D memory, no medical advice |
| Rehab protocol context | Therapist-created plan with constraints | Respect constraints as hard boundaries |

### Medical domain model

```typescript
interface PhysioContext extends TurnContext {
  contraindications: string[]
  painLog: PainEntry[]
  mobilityBaseline: Record<string, number>
  therapistNotes: string | null
  exerciseModifications: Record<string, string>
}
```

`contraindications` are **hard boundaries** from the therapist-created plan. The coach never overrides them.

### Coach behavior in physio mode

- **Never diagnose** — always defer to therapist
- **Never override plan** — the plan is authoritative
- **Pain tracking** — structured questions (location, intensity 1-10, type), logged as Class D
- **Session abort** — pain >7 → stop workout, suggest contacting therapist
- **Progress logging** — mobility improvements noted per session for therapist review

### Compliance layer

- **Audit log** — every Class D data access logged
- **Role-aware access** — future: therapist sees summaries + pain logs, user sees own data, coach sees MemoryResolver output only
- **Retention** — Class D: configurable per jurisdiction
- **Consent upgrade** — entering physio mode requires explicit additional consent

### Out of scope

- EHR/medical record integration
- Therapist-facing dashboard (separate product feature)
- Real-time therapist supervision
- Diagnostic capabilities

---

## Stage dependency graph

```
Stage 1 (Foundation)
  └── Stage 2 (Coach Intelligence)
       └── Stage 3 (Robustness)
            └── Stage 4 (Privacy)
                 └── Stage 5 (Physio)
```

**Partial parallelism:** Stage 3's utterance classification and performance budgets are independent of Stage 2's memory/motivation work. These can start once Stage 1 is complete. However, Stage 3's observability (coaching mode metrics) and edge cases (ActionBus-dependent) require Stage 2. In practice: start Stage 3 after Stage 2 is mostly done, not after every detail is merged.

Each stage merges to `main` only when complete and tested. No stage leaves the app in a broken state.

---

## Testing approach

Each stage must be testable before merge. Testing strategy per stage:

| Stage | Testing approach |
|---|---|
| **1 — Foundation** | Unit tests for VoiceSession state machine, TurnManager, and tool validation (text-only simulation — no audio needed in CI). Integration test: mock STT input → tool_call event → WorkoutState update. |
| **2 — Coach Intelligence** | Unit tests for mode selection logic, MemoryResolver snapshot assembly. Text-only simulation of Five Whys dialogue flow. Integration: verify model selection routing per context. |
| **3 — Robustness** | Unit tests for utterance classifier (fixed input/output pairs). Load test: simulated rapid-fire turns to verify debounce/queue. Performance budget assertions in CI. |
| **4 — Privacy** | Unit tests for all privacy hooks (canStoreMemory, shouldRedactLog, canRetrieveMemory, canExecuteTool, enforceRetention). Integration: verify MemoryResolver respects consent filtering. Data export/deletion end-to-end test. |
| **5 — Physio** | Unit tests for sensitivity router. Integration: verify Class D classification on medical utterances. Compliance: audit log assertions for Class D access. Pain threshold abort scenario test. |

**Key principle from Codex v2:** The voice runtime must be testable with text-only simulations. All CI tests use mock audio (text strings as STT input, assertion on text output) — no microphone or speaker dependencies.
