# Privacy / GDPR Architecture Notes

## Objective
Prepare the platform so that:
- Stage 1 fitness launches with privacy-friendly defaults
- Stage 2 medical/physio can be added on top of the same architecture with stronger controls

This document is an architectural guide, not legal advice.

---

## Core privacy principles

1. **Data minimization**
   Only store what is needed for product function or clear personalization value.

2. **Purpose separation**
   Separate session operation, personalization memory, analytics, and debugging.

3. **Stage-aware governance**
   Fitness and medical modes must have different policy strictness.

4. **No raw voice retention by default**
   Raw audio should not be persisted unless explicitly justified and governed.

5. **Selective memory only**
   Long-term memory must contain structured insights, not raw transcript archives.

6. **Delete/export readiness**
   User-linked data must be addressable and removable.

7. **Least privilege**
   Components should only access the data classes they need.

---

## Stage 1 – Fitness baseline requirements

### Must-have controls
- privacy-friendly defaults
- memory reset
- memory opt-out or personalization off switch
- no raw audio retention by default
- separate operational logs from personalization memory
- sensitivity labels available even if not fully used yet
- retention classes already modeled in code/config

### Recommended defaults
- short-lived session transcripts if transcripts are needed at all
- compact strategy summary instead of full transcript replay
- masked/redacted logs for debugging

---

## Stage 2 – Medical / physio extension requirements

### Additional controls
- health-sensitive content classification
- stricter handling for medically sensitive context
- explicit stage-based policy enforcement
- role-aware data access
- export/delete workflows that cover sensitive memories
- auditable handling of sensitive events and restricted actions
- deployment/provider routing consistent with medical sensitivity requirements

### Architectural implication
The system must be able to treat the same utterance differently depending on mode and sensitivity.

Example:
- fitness mode: “my knee feels weak today” may be stored as a barrier hint
- medical mode: the same statement may require restricted logging, different memory behavior, and a safety-oriented response policy

---

## Privacy-relevant components

### Client
- privacy preferences UI
- transparency about personalization usage
- reset/delete request initiation

### Coach Runtime
- avoid unnecessary repetition of sensitive details
- operate on minimal injected context
- respect stage-specific boundaries

### Coach Orchestrator
- central policy enforcement point
- sensitivity-aware routing
- retention/deletion control integration
- audit trail for memory writes and sensitive tool actions

### Memory
- structured, scoped, minimal
- stage-aware category restrictions
- deletable and exportable
- no hidden shadow copies

---

## Required architecture decisions

1. Every stored record must be linkable to a user identity scope.
2. Memory categories must support sensitivity tags.
3. Session logs and memory must be physically or logically separable.
4. Stage mode (`fitness` / `medical`) must be present in runtime and orchestration.
5. Deletion and export must be first-class design concerns, not later bolt-ons.
6. Debug logs must not become a hidden archive of sensitive transcript content.

---

## Minimum technical controls

- encryption in transit
- encryption at rest
- scoped identifiers
- redaction utilities
- retention configuration
- deletion jobs
- export jobs
- audit logs for sensitive actions
- restricted memory retrieval by category and mode

---

## Policy hooks to implement

- `can_store_memory(record, stage_mode, sensitivity)`
- `can_retrieve_memory(category, stage_mode)`
- `should_redact_log(payload, sensitivity)`
- `retention_class_for(record_type, stage_mode, sensitivity)`
- `can_execute_tool(tool_name, stage_mode, sensitivity_state)`

These hooks should be built into the architecture early.
