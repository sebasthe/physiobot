# Prioritized Backlog

## Prioritization logic

The backlog is prioritized by this order:

1. End-to-end usefulness for a first fitness MVP
2. Architectural decisions that avoid later rewrites for the medical variant
3. Risk reduction for realtime voice experience
4. Privacy/compliance foundations that must exist from day one
5. Long-term personalization and advanced coaching strategy

---

## P0 – Foundation and MVP-critical

### EPIC P0.1 – Workout state as source of truth
**Goal**: Establish a canonical session/workout state model that drives UI, coach behavior, and app control.

**Why first**
Without this, the coach will hallucinate progress, lose sync with the app, and become unreliable.

**Core scope**
- Define workout/session state schema
- Define exercise lifecycle and allowed actions
- Define state transition rules
- Define event model for client ↔ orchestrator ↔ runtime

**Acceptance criteria**
- App and coach can read the same current exercise and phase
- Coach actions like `next_exercise` or `pause_workout` only work when allowed by state
- State transitions are deterministic and testable

**Dependencies**
None

---

### EPIC P0.2 – Realtime voice loop
**Goal**: Implement a low-latency voice interaction loop for coach ↔ user conversation.

**Core scope**
- Client audio capture/playback
- Realtime session connection
- Turn detection and interruption handling
- Short speech responses optimized for training flow

**Acceptance criteria**
- User can speak during a workout
- Coach can respond in voice with short, natural utterances
- Ongoing coach speech can be interrupted by the user

**Dependencies**
P0.1

---

### EPIC P0.3 – Coach runtime and policy
**Goal**: Implement a constrained coach persona that stays on workout topic and can operate in performance mode and guidance mode.

**Core scope**
- Coach system policy
- Mode switching: performance vs guidance
- Short-form voice response shaping
- Topic boundary rules
- Safety fallback behavior

**Acceptance criteria**
- Coach remains focused on training
- Coach does not drift into unrelated chat
- Coach can answer form questions briefly and return to the exercise

**Dependencies**
P0.1, P0.2

---

### EPIC P0.4 – Tool-based app control
**Goal**: Allow the coach to trigger app actions through explicit tools instead of implicit narration.

**Core scope**
- Tool contract definitions
- Tool execution service
- State validation before tool execution
- Confirmation logic back into the conversation and UI

**Key tools**
- `get_current_workout_state`
- `pause_workout`
- `resume_workout`
- `next_exercise`
- `repeat_instruction`
- `mark_set_complete`
- `adjust_intensity`

**Acceptance criteria**
- Coach can move to next exercise via tool call
- Coach cannot claim to have executed an action if the tool failed
- Tool call results are auditable

**Dependencies**
P0.1, P0.3

---

### EPIC P0.5 – Privacy and data-minimization foundation
**Goal**: Build the platform in a privacy-aware way from the beginning, even for the fitness MVP.

**Core scope**
- Data classification
- Logging policy
- Retention policy
- Redaction strategy
- Memory write guards
- Consent/preferences surface for non-essential data handling

**Acceptance criteria**
- No raw audio retention by default
- Session logs are separated from product analytics
- Personalization memory can be disabled or reset
- Sensitive content categories can be tagged and routed differently

**Dependencies**
P0.1

---

## P1 – Strong fitness product

### EPIC P1.1 – Motivation engine
**Goal**: Make the coach motivational, persistent, and context-aware instead of only instructional.

**Core scope**
- Motivational style rules
- Intervention selection
- Detection of low-motivation signals
- Re-engagement patterns

**Acceptance criteria**
- Coach can detect motivation drops
- Coach can switch to motivational intervention without losing training focus
- Coach tone can vary by user preference and session context

**Dependencies**
P0.2, P0.3, P0.4

---

### EPIC P1.2 – Long-term coaching memory
**Goal**: Build selective long-term memory with structured storage of motivators, barriers, and preferences.

**Core scope**
- Mem0 integration
- Memory categories and metadata
- Background memory extraction
- Retrieval of compact coaching snapshots

**Acceptance criteria**
- Coach can remember stable motivation patterns across sessions
- Memory writes are selective and asynchronous
- Retrieval returns small, relevant summaries instead of raw transcript dumps

**Dependencies**
P0.5, P1.1

---

### EPIC P1.3 – Strategy builder
**Goal**: Convert raw memories into a compact coaching strategy profile.

**Core scope**
- Derived profile format
- Strategy update job
- Confidence/stability handling
- Coaching-style adaptation

**Acceptance criteria**
- A summarized coaching profile is available per user
- Profile is derived from confirmed memories, not just latest statements
- Coach can use the profile without needing full memory retrieval

**Dependencies**
P1.2

---

### EPIC P1.4 – Mixed control mode
**Goal**: Support both click-driven and voice-driven workout progression.

**Core scope**
- UI control integration
- Voice command parity
- Conflict handling between tap and voice
- State reconciliation

**Acceptance criteria**
- User can continue by button or by voice
- Voice-triggered actions are reflected in the UI immediately
- Conflicts are resolved deterministically

**Dependencies**
P0.1, P0.4

---

## P2 – Fitness refinement and operational robustness

### EPIC P2.1 – Interruption classification layer
**Goal**: Distinguish filler sounds, confirmations, actual questions, commands, and safety signals.

**Core scope**
- Utterance classification model/rules
- Command detection
- Safety detection
- Soft vs hard interruption routing

**Acceptance criteria**
- Breathing/noise does not constantly interrupt the coach
- “pause” and “next exercise” reliably interrupt
- pain-related phrases trigger the safety path

**Dependencies**
P0.2, P0.3

---

### EPIC P2.2 – Observability and quality metrics
**Goal**: Measure realtime quality, coaching outcomes, and stability.

**Core scope**
- Latency metrics
- Tool success metrics
- False interruption tracking
- Drop-off and session completion tracking
- Memory quality monitoring

**Acceptance criteria**
- Key latency metrics are visible
- False-interruption rate can be monitored
- Memory write/read behavior is auditable

**Dependencies**
P0.2, P0.4, P1.2

---

## P3 – Medical / physio expansion preparation

### EPIC P3.1 – Sensitivity-aware routing
**Goal**: Route medically sensitive content through stricter handling than normal fitness content.

**Core scope**
- Sensitive-content detection
- Privacy tags
- Restricted memory writes
- Specialized logging rules

**Acceptance criteria**
- Potential health-related utterances are tagged
- Sensitive content can bypass or restrict standard memory behavior
- Storage and retrieval behavior differs by sensitivity class

**Dependencies**
P0.5, P2.1

---

### EPIC P3.2 – Medical/physio domain model
**Goal**: Extend the fitness model with medically relevant concepts without breaking the base architecture.

**Core scope**
- Rehab protocol metadata
- Safety thresholds
- pain/discomfort check-ins
- restricted action handling
- clinician-structured plans

**Acceptance criteria**
- Medical plans can be represented with the same session engine
- The coach can reference therapeutic context without becoming a diagnosis bot
- Exercise control supports rehab-specific checkpoints

**Dependencies**
P0.1, P3.1

---

### EPIC P3.3 – Compliance layer for medical variant
**Goal**: Add the controls needed for GDPR-sensitive medical operation.

**Core scope**
- Consent/legal basis hooks
- deletion/export flows
- stricter retention classes
- audit logging
- role-based access boundaries
- EU deployment constraints

**Acceptance criteria**
- Medical-mode data classes have explicit retention behavior
- Deletion and export are implementable at user level
- Sensitive memories are separately governed

**Dependencies**
P0.5, P3.1

---

## P4 – Advanced coaching intelligence

### EPIC P4.1 – Five Whys / deep motivation probes
**Goal**: Enable guided, targeted motivation discovery across sessions.

**Core scope**
- Trigger rules for deeper probes
- Five Whys flow
- consequence and positive-future reframing
- memory update pipeline

**Acceptance criteria**
- Probes happen only at suitable moments
- Resulting motivation insights are stored in structured memory
- Coach remains supportive, not manipulative

**Dependencies**
P1.2, P1.3

---

### EPIC P4.2 – Stage-adaptive coaching strategy
**Goal**: Let the coach adapt approach based on user readiness, consistency, barriers, and progress.

**Core scope**
- strategy variants
- readiness scoring
- adaptive intervention rules
- longitudinal coaching state

**Acceptance criteria**
- Users with recurring drop-offs receive a different coaching approach than consistent users
- Strategy remains explainable and testable

**Dependencies**
P1.3, P4.1
