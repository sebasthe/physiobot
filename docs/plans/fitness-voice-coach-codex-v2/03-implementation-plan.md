# Implementation Plan

## Overall approach
Build in four macro phases:

1. **Phase A – Platform backbone**
2. **Phase B – Fitness MVP**
3. **Phase C – Personalized coaching**
4. **Phase D – Medical/physio expansion**

Each phase must leave the system in a testable, runnable state.

---

## Phase A – Platform backbone

### Objective
Create the architectural spine that both the fitness and medical variants will use.

### Work packages

#### A1 – Define canonical schemas
Deliverables:
- workout state schema
- session event schema
- tool contracts
- strategy summary schema
- privacy/sensitivity tags

#### A2 – Build orchestrator skeleton
Deliverables:
- session state service
- tool gateway shell
- runtime adapter interface
- event bus or message flow abstraction

#### A3 – Build client connection skeleton
Deliverables:
- audio capture/playback shell
- realtime transport abstraction
- coach status UI states
- local session cache

#### A4 – Privacy foundation
Deliverables:
- data classification module
- retention policy config
- redaction utilities
- user privacy settings surface

### Exit criteria
- mocked end-to-end flow from UI event → state update → runtime context → tool action
- stage mode flag exists (`fitness` / `medical`)
- data categories and retention classes are represented in code

---

## Phase B – Fitness MVP

### Objective
Ship a useful voice-driven fitness coaching experience.

### Work packages

#### B1 – Realtime coach loop
Deliverables:
- working voice session
- interruption handling
- short-form coach responses
- performance/guidance mode switching

#### B2 – Tool-based app control
Deliverables:
- `pause_workout`
- `resume_workout`
- `next_exercise`
- `repeat_instruction`
- `mark_set_complete`

#### B3 – Fitness coach policy
Deliverables:
- constrained system instructions
- response length rules
- workout-topic guardrails
- off-topic redirection

#### B4 – Mixed control UX
Deliverables:
- click and voice parity
- deterministic reconciliation
- UI feedback on voice-triggered actions

#### B5 – Baseline observability
Deliverables:
- latency metrics
- interruption metrics
- tool success/failure metrics
- session completion metrics

### Exit criteria
- user can run a workout with tap and voice
- coach can guide, motivate, and advance the workout
- coach remains on topic
- no raw audio stored by default

---

## Phase C – Personalized coaching

### Objective
Add memory, strategy, and adaptive motivation without destabilizing realtime behavior.

### Work packages

#### C1 – Memory integration
Deliverables:
- Mem0 integration layer
- memory category definitions
- memory write filters
- async write pipeline

#### C2 – Memory retrieval and strategy summary
Deliverables:
- compact coaching snapshot API
- strategy summary generation job
- retrieval rules for runtime context injection

#### C3 – Motivation engine
Deliverables:
- low-motivation detection
- intervention chooser
- coaching style adaptation
- fallback patterns

#### C4 – Deep motivation probes
Deliverables:
- Five Whys flow
- positive-future / negative-consequence reframing flow
- usage triggers and limits
- memory write-back from probe results

### Exit criteria
- coach can adapt tone and prompts across sessions
- stable motivators can be remembered and reused
- deep probes happen only when appropriate
- runtime still receives compact context only

---

## Phase D – Medical / physio expansion

### Objective
Extend the platform from fitness into a privacy- and sensitivity-aware medical/physio product.

### Work packages

#### D1 – Sensitive-content router
Deliverables:
- health-sensitive phrase detection
- sensitivity labels
- restricted write/read behavior
- alternate logging paths

#### D2 – Medical domain model
Deliverables:
- rehab plan schema
- pain/discomfort check-ins
- safety checkpoints
- clinician-defined plan support hooks

#### D3 – Compliance controls
Deliverables:
- consent/legal-basis integration points
- export/delete workflows
- stricter retention classes
- access controls / role boundaries
- auditability for sensitive actions

#### D4 – Medical coach policy
Deliverables:
- no-diagnosis rules
- discomfort escalation rules
- stricter response boundaries
- rehab-safe coaching patterns

### Exit criteria
- medical mode can be enabled without replacing the base architecture
- sensitive data handling is distinct from fitness mode
- rehab workflows fit the same session-state engine

---

## Suggested Codex execution slices

### Slice 1
- state schema
- event schema
- tool contracts
- repo skeleton

### Slice 2
- session state service
- tool gateway
- stage mode config

### Slice 3
- client voice shell
- coach runtime adapter
- mocked realtime loop

### Slice 4
- fitness coach policy
- performance/guidance mode logic
- click/voice reconciliation

### Slice 5
- observability and logging separation
- privacy settings
- data classification plumbing

### Slice 6
- Mem0 integration
- async memory write pipeline
- strategy summary generator

### Slice 7
- motivation engine
- probe workflows
- strategy-aware prompting

### Slice 8
- sensitive-content router
- medical mode extension
- export/delete/retention enforcement

---

## Testing plan by phase

### Phase A tests
- schema validation
- state transition tests
- tool contract tests
- sensitivity-tag propagation tests

### Phase B tests
- simulated workout voice loop
- interruption handling tests
- tool execution from voice command tests
- off-topic boundary tests

### Phase C tests
- memory extraction quality tests
- retrieval relevance tests
- strategy summary consistency tests
- motivation intervention trigger tests

### Phase D tests
- medical-mode policy tests
- sensitive-content routing tests
- deletion/export workflow tests
- retention enforcement tests

---

## Non-functional requirements to enforce throughout

- low perceived latency
- deterministic state transitions
- easy text-only simulation for CI
- no hidden coupling between runtime and memory store
- privacy-by-default behavior
- mode-based extensibility for medical features
