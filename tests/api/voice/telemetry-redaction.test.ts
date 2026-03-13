import { describe, expect, it } from 'vitest'
import { classifyTelemetryEvent } from '@/lib/privacy/classifier'
import { shouldRedactLog } from '@/lib/privacy/hooks'
import { DataClass } from '@/lib/privacy/types'

describe('telemetry redaction integration', () => {
  it('strips text from agent reply events', () => {
    const event = {
      event_type: 'agent_reply_received',
      payload: {
        reply: 'Gut gemacht!',
        llmLatencyMs: 120,
        totalLatencyMs: 200,
      },
    }

    const dataClass = classifyTelemetryEvent(event.event_type)
    const redacted = shouldRedactLog(event, dataClass)

    expect(dataClass).toBe(DataClass.PersonalCoaching)
    expect(redacted.payload.reply).toBeUndefined()
    expect(redacted.payload.llmLatencyMs).toBe(120)
  })

  it('preserves turn metrics events fully', () => {
    const event = {
      event_type: 'turn_metrics',
      payload: { totalTurnTime: 1200, sttToClassification: 50 },
    }

    const dataClass = classifyTelemetryEvent(event.event_type)
    const redacted = shouldRedactLog(event, dataClass)

    expect(dataClass).toBe(DataClass.Operational)
    expect(redacted.payload.totalTurnTime).toBe(1200)
  })
})
