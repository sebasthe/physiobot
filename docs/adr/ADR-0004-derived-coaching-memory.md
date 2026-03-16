# ADR-0004 Derived Coaching Memory

- Date: 2026-03-13
- Status: Accepted

## Context

Raw transcripts are too noisy to use directly as the main long-term coaching memory. The coach needs durable, stable patterns such as motivation, personality preferences, fatigue signals, and recurring pain points.

At the same time, privacy controls must still apply to what gets stored and what can later be reused.

## Decision

Use a derived-memory approach:

- store raw transcript context when useful
- extract stable insights from session conversations with Claude
- classify extracted items by data class
- gate storage and retrieval by user consent
- build a structured session snapshot for live coaching from memory searches

## Consequences

### Positive

- Coaching prompts can stay focused on durable user context instead of noisy conversation history.
- The system can adapt tone and safety behavior across sessions.
- Privacy rules apply to memory both at write time and read time.

### Tradeoffs

- The memory pipeline depends on an external memory provider and an extra extraction step.
- Extracted memories are an interpretation layer, not a verbatim record.
- Classification, consent, and audit logic have to be maintained across the memory stack.
