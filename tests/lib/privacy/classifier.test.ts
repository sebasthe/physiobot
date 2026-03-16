import { describe, expect, it } from 'vitest'
import { classifyMemory, classifyTelemetryEvent } from '@/lib/privacy/classifier'
import { DataClass } from '@/lib/privacy/types'

describe('classifyMemory', () => {
  it('classifies motivation as SensitiveWellness', () => {
    expect(classifyMemory('motivation_hints', 'Fuer meine Kinder da sein')).toBe(DataClass.SensitiveWellness)
  })

  it('classifies personality as PersonalCoaching', () => {
    expect(classifyMemory('personality_preferences', 'direkt')).toBe(DataClass.PersonalCoaching)
  })

  it('escalates medical language to MedicalRehab', () => {
    expect(classifyMemory('training_patterns', 'Stechender Schmerz im Knie seit 2 Wochen')).toBe(DataClass.MedicalRehab)
  })
})

describe('classifyTelemetryEvent', () => {
  it('keeps non-text telemetry operational', () => {
    expect(classifyTelemetryEvent('turn_metrics')).toBe(DataClass.Operational)
    expect(classifyTelemetryEvent('listen_started')).toBe(DataClass.Operational)
  })

  it('marks text-bearing telemetry as coaching data', () => {
    expect(classifyTelemetryEvent('agent_reply_received')).toBe(DataClass.PersonalCoaching)
    expect(classifyTelemetryEvent('transcript_committed')).toBe(DataClass.PersonalCoaching)
  })

  it('marks class d audit events as medical', () => {
    expect(classifyTelemetryEvent('class_d_write')).toBe(DataClass.MedicalRehab)
  })
})
