# Fitness / Physio Voice Coach – Codex Implementation Package

This package is structured for implementation with Codex CLI and is intentionally split into:

- **Stage 1: Fitness app**
- **Stage 2: Medical / physio app**

The architecture is prepared from the beginning so that the fitness product can ship fast, while the medical variant can be added later without a fundamental redesign.

## File overview

1. `01-backlog-prioritized.md`
   Prioritized backlog across both stages with epics, rationale, acceptance criteria, and dependencies.

2. `02-architecture.md`
   Target architecture of app/client, coach runtime, coach orchestrator, memory, and privacy/compliance layer.

3. `03-implementation-plan.md`
   Concrete implementation plan by phases, milestones, deliverables, and suggested Codex work packages.

4. `04-codex-source-inputs.md`
   Suggested source inputs for Codex per workstream, including schemas, prompts, contracts, and context handoff.

5. `05-user-stories.md`
   User stories grouped by epic, split into Stage 1 fitness and Stage 2 medical/physio expansion.

6. `06-privacy-gdpr.md`
   GDPR/privacy architecture requirements and stage-based compliance path.

7. `07-data-classification-retention.md`
   Data classes, retention rules, deletion/export requirements, and logging guidance.

8. `08-target-repo-structure.md`
   Suggested repository structure and implementation boundaries for Codex.

## Recommended execution order

1. Read `02-architecture.md`
2. Read `06-privacy-gdpr.md`
3. Use `01-backlog-prioritized.md` to decide the first implementation slice
4. Use `03-implementation-plan.md` to execute work phase by phase
5. Feed Codex with the relevant subset from `04-codex-source-inputs.md`
6. Use `05-user-stories.md` as the feature contract
7. Keep `07-data-classification-retention.md` and `08-target-repo-structure.md` aligned with implementation

## Guiding principle

- **App state is the source of truth**
- **The coach is a realtime voice agent operating on app state**
- **Memory is selective, structured, and asynchronous**
- **Privacy/compliance is an explicit layer, not an afterthought**
- **Stage 1 should already be architected so that Stage 2 medical requirements can be added with controlled extension instead of a platform rewrite**
