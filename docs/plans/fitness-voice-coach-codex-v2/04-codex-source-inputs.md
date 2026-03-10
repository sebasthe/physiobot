# Codex Source Inputs

This file describes what Codex should receive as context for each implementation area.

## General rule
Do not give Codex the whole package every time. Give it:
- one target file or small file set
- the relevant schema/contracts
- the user stories for that slice
- the acceptance criteria
- the stage context (`fitness` or `medical`)

---

## A. Backbone work

### When implementing schemas
Give Codex:
- `02-architecture.md`
- `03-implementation-plan.md` (Phase A)
- relevant user stories from `05-user-stories.md`
- a target output request such as:
  - `workout-state.schema.ts`
  - `session-events.ts`
  - `tool-contracts.ts`
  - `sensitivity-types.ts`

### Required context snippets
- app state is source of truth
- stage mode must be represented from the start
- sensitive-content tags must be first-class

---

## B. Realtime runtime work

### When implementing coach runtime
Give Codex:
- `02-architecture.md` sections on client and coach runtime
- `05-user-stories.md` for realtime coaching
- target response rules for performance/guidance/safety mode
- explicit runtime constraints:
  - no ownership of authoritative state
  - no direct unrestricted memory reads
  - all app actions via tools

### Example target files
- `coach-runtime.ts`
- `turn-detector.ts`
- `interruption-manager.ts`
- `utterance-classifier.ts`
- `coach-policy.ts`

---

## C. Orchestrator work

### When implementing orchestrator modules
Give Codex:
- `02-architecture.md` orchestrator section
- `03-implementation-plan.md` phases A/C/D as needed
- relevant tool contracts and state schemas
- user stories for app control, motivation, memory, or medical routing

### Example target files
- `session-state-service.ts`
- `tool-gateway.ts`
- `motivation-engine.ts`
- `strategy-builder.ts`
- `sensitive-content-router.ts`

---

## D. Memory work

### When implementing memory integration
Give Codex:
- `02-architecture.md` memory section
- `06-privacy-gdpr.md`
- `07-data-classification-retention.md`
- user stories for memory and personalization
- explicit constraints:
  - selective writes only
  - async pipeline
  - compact retrieval only
  - stage-aware restrictions

### Example target files
- `memory-client.ts`
- `memory-extractor.ts`
- `memory-categories.ts`
- `strategy-summary-job.ts`
- `memory-policy.ts`

---

## E. Privacy/compliance work

### When implementing privacy layer
Give Codex:
- `06-privacy-gdpr.md`
- `07-data-classification-retention.md`
- `02-architecture.md` privacy section
- stage context: fitness or medical

### Example target files
- `data-classification.ts`
- `retention-policy.ts`
- `redaction.ts`
- `consent-policy.ts`
- `export-delete-service.ts`

---

## F. Prompt/policy work

### When implementing coach behavior
Give Codex:
- architecture behavior mode definitions
- motivation requirements
- user stories for on-topic behavior and adaptive coaching
- explicit response constraints
- examples of good and bad responses

### Example target files
- `coach-policy.md`
- `motivation-playbook.md`
- `dialogues.md`

---

## Prompt template for Codex tasks

Use a structure like this:

```md
Task:
Implement <target module> for the <fitness|medical> stage.

Context files:
- 02-architecture.md
- 03-implementation-plan.md
- 05-user-stories.md
- <specific schema/policy files>

Requirements:
- <list>

Constraints:
- app state is source of truth
- no hidden coupling to memory
- privacy-aware defaults
- all app actions go through tools

Output:
- create/modify <target files>
- include tests
- include brief inline docs
```

---

## Recommended future source files to add
These should be generated in the next step and then used as high-value Codex context:
- `coach-policy.md`
- `motivation-playbook.md`
- `dialogues.md`
- `payloads.md`
- `test-scenarios.md`
- `privacy-gdpr.md` (already included now as `06-privacy-gdpr.md`)
