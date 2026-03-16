# ADR-0002 Privacy Consent and Data Classification

- Date: 2026-03-13
- Status: Accepted

## Context

PhysioBot handles several different kinds of user data, from operational voice telemetry to rehab-sensitive pain reports and coaching memory. A single storage rule is not appropriate for all of them.

The product also needs a user-facing privacy setting that is simple enough to explain without exposing internal implementation detail.

## Decision

Use:

- three consent levels: `full`, `minimal`, `none`
- four data classes: `A`, `B`, `C`, `D`

These controls govern:

- whether memory can be stored
- whether memory can be retrieved
- whether telemetry payloads must be redacted
- when medical-rehab access should generate audit-style events

## Consequences

### Positive

- Privacy behavior becomes predictable across product features.
- Sensitive rehab context can be treated differently from operational telemetry.
- The settings UI can expose a small, understandable privacy model.

### Tradeoffs

- Feature behavior changes materially by consent level, which adds complexity.
- Memory and telemetry pipelines must both understand classification logic.
- Retention and deletion behavior must be documented carefully to avoid false expectations.
