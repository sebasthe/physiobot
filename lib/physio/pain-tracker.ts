import type { PainEntry } from './types'

interface PainReportInput {
  location: string
  intensity: number
  type: string
}

export const PAIN_ABORT_THRESHOLD = 8

export function parsePainReport(input: PainReportInput, exerciseId: string): PainEntry {
  return {
    location: input.location,
    intensity: Math.max(1, Math.min(10, Math.round(input.intensity))),
    type: input.type,
    exerciseId,
    timestamp: new Date().toISOString(),
  }
}

export function shouldAbortSession(entry: PainEntry): boolean {
  return entry.intensity >= PAIN_ABORT_THRESHOLD
}
