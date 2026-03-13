import type { SensitivityLevel } from '@/lib/physio/sensitivity-router'
import { DataClass, type ConsentLevel } from './types'

interface StoreContext {
  dataClass: DataClass
  consent: ConsentLevel
}

interface RetrieveContext {
  dataClass: DataClass
  consent: ConsentLevel
}

interface TelemetryEvent {
  event_type: string
  payload: Record<string, unknown>
}

const FULL_CONSENT_ONLY = new Set<DataClass>([
  DataClass.PersonalCoaching,
  DataClass.SensitiveWellness,
  DataClass.MedicalRehab,
])

const REDACTED_TEXT_FIELDS = new Set(['text', 'transcript', 'reply', 'content', 'message'])
const BLOCKED_AT_HIGH_SENSITIVITY = new Set(['adjust_timer', 'adjust_intensity'])

export function canStoreMemory(ctx: StoreContext): boolean {
  if (ctx.consent === 'none') {
    return false
  }

  if (FULL_CONSENT_ONLY.has(ctx.dataClass) && ctx.consent !== 'full') {
    return false
  }

  return true
}

export function canRetrieveMemory(ctx: RetrieveContext): boolean {
  if (ctx.dataClass === DataClass.Operational) {
    return true
  }

  if (ctx.consent !== 'full') {
    return false
  }

  return true
}

export function shouldRedactLog(event: TelemetryEvent, dataClass: DataClass): TelemetryEvent {
  if (dataClass === DataClass.Operational) {
    return {
      ...event,
      payload: { ...event.payload },
    }
  }

  return {
    ...event,
    payload: redactObject(event.payload),
  }
}

export function canExecuteTool(toolName: string, sensitivityLevel: SensitivityLevel | string): boolean {
  if (sensitivityLevel === 'high' && BLOCKED_AT_HIGH_SENSITIVITY.has(toolName)) {
    return false
  }

  return true
}

function redactObject(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value)) {
    if (REDACTED_TEXT_FIELDS.has(key.toLowerCase())) {
      continue
    }

    if (Array.isArray(entry)) {
      next[key] = entry.map(item => {
        if (isRecord(item)) {
          return redactObject(item)
        }
        return item
      })
      continue
    }

    if (isRecord(entry)) {
      next[key] = redactObject(entry)
      continue
    }

    next[key] = entry
  }

  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
