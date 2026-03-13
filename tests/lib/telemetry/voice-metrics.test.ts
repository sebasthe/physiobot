import { describe, expect, it } from 'vitest'
import { computeTurnMetrics } from '@/lib/telemetry/voice-metrics'

describe('computeTurnMetrics', () => {
  it('computes all latency segments', () => {
    const metrics = computeTurnMetrics({
      sttCommitTime: 1000,
      classificationDoneTime: 1150,
      llmFirstTokenTime: 1400,
      llmDoneTime: 1800,
      ttsStartTime: 1450,
      ttsDoneTime: 2200,
    })

    expect(metrics.sttToClassification).toBe(150)
    expect(metrics.classificationToFirstToken).toBe(250)
    expect(metrics.llmFirstToken).toBe(400)
    expect(metrics.llmTotal).toBe(800)
    expect(metrics.ttsLatency).toBe(750)
    expect(metrics.totalTurnTime).toBe(1200)
  })

  it('handles missing classification when fast path skipped it', () => {
    const metrics = computeTurnMetrics({
      sttCommitTime: 1000,
      classificationDoneTime: null,
      llmFirstTokenTime: 1300,
      llmDoneTime: 1700,
      ttsStartTime: 1350,
      ttsDoneTime: 2000,
    })

    expect(metrics.sttToClassification).toBeNull()
    expect(metrics.classificationToFirstToken).toBeNull()
    expect(metrics.totalTurnTime).toBe(1000)
  })
})
