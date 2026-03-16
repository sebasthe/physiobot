# ADR-0003 Physio Safety Boundaries

- Date: 2026-03-13
- Status: Accepted

## Context

PhysioBot can run with therapist-authored plan context, contraindications, pain history, and mobility constraints. In that mode, generic motivational coaching is not sufficient.

The system needs hard boundaries that keep the AI coach from acting like a diagnosis engine or improvising outside the therapy plan.

## Decision

When physio context is present, the live coach will operate under explicit safety boundaries:

- do not diagnose
- do not deviate from the therapy plan
- record pain through a dedicated pain-report path
- stop the session when pain intensity reaches the configured abort threshold
- prefer safer guidance when sensitive or medical language is detected

## Consequences

### Positive

- The live coach becomes more aligned with therapist intent.
- High-risk scenarios are handled more conservatively.
- Pain reporting becomes part of the structured product flow instead of free-text only.

### Tradeoffs

- Physio mode depends on accurate plan metadata and pain logging.
- The client currently uses a lightweight session-scoped consent gate rather than a durable consent record.
- Safety-first behavior may feel less flexible than the standard coaching mode.
