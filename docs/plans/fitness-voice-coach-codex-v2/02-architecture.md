# Target Architecture

## Architecture goals

The platform must support two stages:

- **Stage 1: Fitness app**
  - fast delivery
  - strong realtime coach experience
  - selective personalization
  - privacy-aware by design

- **Stage 2: Medical / physio app**
  - same core interaction model
  - stricter data governance
  - health-sensitive routing and storage
  - compliance and operational controls

The architecture is intentionally layered so Stage 2 extends the system instead of replacing it.

---

## High-level architecture

```text
Client App
  ├─ Workout UI
  ├─ Audio I/O
  ├─ Local session cache
  ├─ Realtime connection manager
  └─ Consent / privacy preferences UI

Coach Runtime
  ├─ Realtime voice agent
  ├─ Turn detection
  ├─ Interruption handling
  ├─ Response generation
  ├─ Tool calling adapter
  └─ Short-term session context

Coach Orchestrator
  ├─ Session state service
  ├─ Tool gateway
  ├─ Motivation engine
  ├─ Strategy builder
  ├─ Memory extractor
  ├─ Sensitive-content routing
  └─ Policy enforcement

Memory Layer
  ├─ Session summaries
  ├─ Long-term coaching memory
  ├─ Strategy summary
  ├─ Memory retrieval API
  └─ Async memory write pipeline

Privacy & Compliance Layer
  ├─ Data classification
  ├─ Consent/legal-basis hooks
  ├─ Retention rules
  ├─ Deletion/export workflows
  ├─ Redaction
  ├─ Audit logging
  ├─ Access control
  └─ Deployment/region policies
```

---

# 1. App / Client Architecture

## Responsibilities
The client is responsible for user interaction and realtime experience, but not for authoritative coaching logic.

### Core responsibilities
- capture and play audio
- render workout progress and exercise instructions
- render coach state: listening / thinking / speaking / paused
- maintain local session cache for responsiveness
- dispatch user input events and app control events
- collect explicit privacy/consent preferences
- expose user controls for memory reset and voice/privacy settings

## Design rules
- client must remain responsive even if backend orchestration is delayed
- client never becomes the source of truth for long-term memory
- client should support both tap control and voice control
- client should support future medical-mode UI extensions without a redesign

## Client state domains
- **UI state**: current screen, playback state, listening indicator
- **session state cache**: current exercise, phase, allowed actions
- **privacy preferences**: personalization on/off, memory reset, transcript preferences
- **transport state**: session token, connection state, reconnect logic

## Client events
Examples:
- `exercise_started`
- `set_completed`
- `pause_clicked`
- `next_clicked`
- `voice_command_detected`
- `privacy_preferences_updated`
- `memory_reset_requested`

---

# 2. Coach Runtime (incl. voice agent)

## Purpose
The coach runtime is the realtime conversational layer. It should be fast, voice-optimized, and tightly constrained.

## Responsibilities
- realtime speech interaction
- turn-taking management
- interruption/barge-in handling
- short-form conversational behavior
- controlled tool invocation
- immediate contextual coaching based on current session state

## Internal behavior modes
### Performance mode
Used during active exercise.
- very short utterances
- high energy
- corrective / motivational
- minimal explanation

### Guidance mode
Used when user asks for clarification.
- slightly longer explanation
- still concise
- must return to workout flow

### Safety mode
Used when discomfort, pain, dizziness, or sensitive cues are detected.
- de-escalate intensity
- encourage pause
- avoid diagnosis
- route into restricted handling path

## Runtime subcomponents
- audio input/output abstraction
- turn detector
- interruption manager
- utterance classifier
- response generator
- tool call adapter
- session-context injector
- safety fallback handler

## Design rules
- runtime must not own authoritative workout state
- runtime must not query raw long-term memory arbitrarily
- runtime receives compact contextual snapshots only
- runtime must be easily testable with text-only simulations

---

# 3. Coach Orchestrator

## Purpose
The orchestrator is the control brain around the runtime. It governs state, tools, strategy, memory, and policy.

## Responsibilities
- maintain canonical session/workout state
- validate and execute app tools
- provide compact context to runtime
- manage motivation strategy
- trigger memory extraction and strategy consolidation
- enforce privacy/compliance policies
- prepare for stage-specific routing (fitness vs medical)

## Core modules

### 3.1 Session State Service
- canonical state model
- allowed-actions engine
- deterministic state transitions
- event ingestion and fan-out

### 3.2 Tool Gateway
- tool registry
- validation rules
- execution adapters
- result normalization
- audit trail

### 3.3 Motivation Engine
- low-motivation detection
- intervention selection
- fallback prompts
- strategy application

### 3.4 Strategy Builder
- derive stable coaching summary from memory
- maintain confidence/stability scores
- version strategy over time

### 3.5 Memory Extractor
- transform raw interactions into memory candidates
- filter low-value or sensitive raw content
- write asynchronously to memory layer

### 3.6 Sensitive-Content Router
- classify content by sensitivity level
- block or restrict certain writes/retrievals
- alter retention/logging behavior
- enable later medical-mode controls

### 3.7 Policy Enforcement Layer
- enforce prompt constraints
- enforce privacy rules
- enforce medical-mode feature flags
- enforce region/provider routing rules

---

# 4. Memory Architecture

## Guiding principle
Memory should support personalization without becoming a raw transcript archive.

## Memory types

### 4.1 Short-term session memory
Purpose:
- support immediate flow of the current conversation
- store recent exchanges and ephemeral coaching cues

Characteristics:
- temporary
- strongly bounded
- not a user profile
- short retention

### 4.2 Long-term coaching memory
Purpose:
- persist stable insights across sessions
- store motivators, barriers, style preferences, and milestone patterns

Characteristics:
- structured
- selective
- metadata-tagged
- scoped by user/app/agent

### 4.3 Strategy summary
Purpose:
- give runtime a compact coaching snapshot
- avoid retrieving many raw memory entries at runtime

Characteristics:
- derived artifact
- versioned
- confidence-aware
- easy to inject into runtime context

## Recommended memory categories
- `motivation_core`
- `motivation_surface`
- `barrier`
- `excuse_pattern`
- `coach_preference`
- `milestone`
- `strategy_hint`
- `safety_signal`
- `medical_context` (Stage 2 only or tightly restricted)

## Write path
1. user interaction occurs
2. relevant excerpts are summarized
3. memory extractor generates candidates
4. sensitive-content router classifies them
5. only approved candidates are written asynchronously
6. strategy builder periodically refreshes the summary

## Read path
1. session starts or key moment occurs
2. orchestrator requests compact strategy snapshot
3. optionally retrieves a few relevant memories
4. runtime receives compressed context, not full history

---

# 5. Privacy & Compliance Layer

## Why explicit
Fitness can be launched with lighter controls, but the medical variant requires stronger safeguards. The architecture must therefore include privacy/compliance as an explicit cross-cutting layer from day one.

## Responsibilities
- classify data by sensitivity
- separate operational logs from user memory
- enforce retention rules
- support export and deletion
- enforce access control and least privilege
- support EU-only or approved-region deployment patterns
- support stage-based policy differences

## Stage split

### Stage 1 – Fitness
Minimum required controls:
- privacy-aware defaults
- no raw audio retention by default
- memory opt-out/reset
- categorized logging
- basic deletion workflow
- sensitivity tagging

### Stage 2 – Medical / Physio
Extended controls:
- explicit handling of health-related data classes
- stronger retention and deletion rules
- consent/legal-basis hooks
- auditability of sensitive actions
- stricter provider and deployment controls
- clinically safe behavior boundaries

---

# 6. Stage-aware architecture behavior

## Stage 1 – Fitness mode
Enabled:
- workout coaching
- motivation memory
- selective personalization
- voice-driven app control

Restricted:
- no medical diagnosis features
- no clinician workflow assumptions
- no heavy health-record modeling

## Stage 2 – Medical / Physio mode
Additional layers enabled:
- sensitivity-aware routing
- medical context objects
- stricter policy enforcement
- extended compliance controls
- rehab-specific exercise workflows
- guarded pain/discomfort handling

The core runtime, orchestrator, and session-state model remain the same. The medical variant extends the same backbone.

---

# 7. Architecture decisions that should not be postponed

1. **Canonical session state model**
2. **Tool-based control instead of prompt-only app actions**
3. **Async selective memory pipeline**
4. **Compact strategy summary abstraction**
5. **Sensitive-content tagging pipeline**
6. **Retention/deletion-ready identifiers and storage model**
7. **Feature flag or mode separation between fitness and medical**

If these are done early, Stage 2 becomes an extension project rather than a rewrite.
