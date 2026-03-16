# ADR-0005 Mode-Based Voice Orchestration

- Date: 2026-03-13
- Status: Accepted

## Context

The voice coach has to behave differently when the user is actively exercising, asking for guidance, reporting pain, or discussing motivation. A single static prompt or one-model-fits-all setup would not handle those cases well.

The system also needs tool calling and streaming responses for a responsive session experience.

## Decision

Use mode-based orchestration for live voice turns:

- select a coaching mode from conversation state and workout context
- use lighter-weight behavior for performance and guidance turns
- escalate to more capable behavior for safety and motivation turns
- stream replies over SSE
- allow the model to request workout tools, but validate and gate them before execution

## Consequences

### Positive

- The coach can switch between short cueing, guidance, safety, and motivation more naturally.
- More expensive model usage is focused on the turns that benefit most from it.
- Tool calling integrates voice responses with workout-state changes.

### Tradeoffs

- Orchestration logic is more complex than a single prompt path.
- Sensitivity routing, tool validation, and telemetry become architectural dependencies.
- Debugging live turns requires strong observability and clear documentation.

## Related Documents

- [Voice Orchestration](../architecture/voice-orchestration.md)
- [Voice Tool Execution](../architecture/voice-tool-execution.md)
