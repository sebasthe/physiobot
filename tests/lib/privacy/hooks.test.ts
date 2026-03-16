import { describe, expect, it } from 'vitest'
import {
  canExecuteTool,
  canRetrieveMemory,
  canStoreMemory,
  shouldRedactLog,
} from '@/lib/privacy/hooks'
import { DataClass } from '@/lib/privacy/types'

describe('canStoreMemory', () => {
  it('allows storing class b with full consent', () => {
    expect(canStoreMemory({ dataClass: DataClass.PersonalCoaching, consent: 'full' })).toBe(true)
  })

  it('allows storing class a with minimal consent', () => {
    expect(canStoreMemory({ dataClass: DataClass.Operational, consent: 'minimal' })).toBe(true)
  })

  it('blocks sensitive data without full consent', () => {
    expect(canStoreMemory({ dataClass: DataClass.SensitiveWellness, consent: 'minimal' })).toBe(false)
    expect(canStoreMemory({ dataClass: DataClass.MedicalRehab, consent: 'minimal' })).toBe(false)
  })

  it('allows class d with full consent in physio mode', () => {
    expect(canStoreMemory({ dataClass: DataClass.MedicalRehab, consent: 'full' })).toBe(true)
  })
})

describe('canRetrieveMemory', () => {
  it('always allows operational data', () => {
    expect(canRetrieveMemory({ dataClass: DataClass.Operational, consent: 'minimal' })).toBe(true)
  })

  it('requires full consent for classes b through d', () => {
    expect(canRetrieveMemory({ dataClass: DataClass.PersonalCoaching, consent: 'minimal' })).toBe(false)
    expect(canRetrieveMemory({ dataClass: DataClass.SensitiveWellness, consent: 'full' })).toBe(true)
    expect(canRetrieveMemory({ dataClass: DataClass.MedicalRehab, consent: 'full' })).toBe(true)
  })
})

describe('shouldRedactLog', () => {
  it('strips text fields from non-operational events', () => {
    const event = {
      event_type: 'agent_reply_received',
      payload: {
        reply: 'Gut gemacht!',
        nested: {
          message: 'Versteckt',
          latency: 100,
        },
        llmLatencyMs: 120,
      },
    }

    const redacted = shouldRedactLog(event, DataClass.PersonalCoaching)

    expect(redacted.payload.reply).toBeUndefined()
    expect(redacted.payload.llmLatencyMs).toBe(120)
    expect(redacted.payload.nested).toEqual({ latency: 100 })
  })

  it('keeps class a events intact', () => {
    const event = { event_type: 'turn_metrics', payload: { totalTurnTime: 1200 } }
    const redacted = shouldRedactLog(event, DataClass.Operational)
    expect(redacted.payload.totalTurnTime).toBe(1200)
  })
})

describe('canExecuteTool', () => {
  it('blocks risky tools at high sensitivity', () => {
    expect(canExecuteTool('adjust_timer', 'high')).toBe(false)
    expect(canExecuteTool('adjust_intensity', 'high')).toBe(false)
  })

  it('keeps safe tools available', () => {
    expect(canExecuteTool('pause_workout', 'high')).toBe(true)
    expect(canExecuteTool('log_pain', 'high')).toBe(true)
    expect(canExecuteTool('next_exercise', 'normal')).toBe(true)
  })
})
