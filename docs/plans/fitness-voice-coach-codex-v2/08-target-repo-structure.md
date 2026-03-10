# Suggested Target Repository Structure

```text
apps/
  mobile-or-web-client/
    src/
      audio/
      coach-ui/
      workout/
      privacy/
      state/
      transport/

services/
  coach-orchestrator/
    src/
      api/
      session-state/
      tools/
      motivation/
      strategy/
      memory/
      privacy/
      routing/
      policies/
      observability/

  coach-runtime/
    src/
      realtime/
      turn-taking/
      interruptions/
      utterance-classification/
      prompting/
      tool-adapter/
      safety/

packages/
  domain/
    src/
      schemas/
      events/
      tools/
      stage-mode/
      sensitivity/
      retention/

  privacy-core/
    src/
      classification/
      retention/
      redaction/
      deletion/
      export/
      access/

  memory-core/
    src/
      categories/
      memory-client/
      extractor/
      strategy-summary/
      policies/

  test-fixtures/
    src/
      payloads/
      transcripts/
      workout-scenarios/
      motivation-scenarios/
      medical-scenarios/

docs/
  codex/
    README.md
    01-backlog-prioritized.md
    02-architecture.md
    03-implementation-plan.md
    04-codex-source-inputs.md
    05-user-stories.md
    06-privacy-gdpr.md
    07-data-classification-retention.md
    08-target-repo-structure.md
```

## Rationale

### `packages/domain`
Keeps schemas and contracts shared across client, runtime, and orchestrator.

### `services/coach-orchestrator`
Owns state, tools, motivation orchestration, privacy enforcement, and memory coordination.

### `services/coach-runtime`
Owns realtime conversational behavior and remains thin relative to business logic.

### `packages/privacy-core`
Makes privacy/compliance a reusable platform concern instead of scattered conditionals.

### `packages/memory-core`
Encapsulates selective memory and strategy generation so it can evolve without tangling the runtime.

---

## Stage-aware extension strategy

### Fitness stage
Implement the full repo shape, but keep medical modules behind flags or minimal placeholders.

### Medical stage
Extend:
- `domain/schemas` with rehab objects
- `privacy-core` with stricter rules
- `coach-orchestrator/routing` for sensitive-content routing
- `coach-runtime/safety` for medical-mode behavior

This preserves one backbone instead of forking the platform.
