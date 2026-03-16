import { DataClass } from './types'

const MEDICAL_KEYWORDS = [
  'schmerz',
  'weh',
  'diagnose',
  'diagnost',
  'arzt',
  'therapeut',
  'medikament',
  'ibuprofen',
  'voltaren',
  'bandscheibe',
  'bandscheib',
  'entzünd',
  'entzuend',
  'operation',
  'operiert',
  'reha',
  'befund',
  'stechend',
  'ziehend',
  'brennend',
  'krampf',
  'taub',
  'kribbel',
  'pain',
  'diagnosis',
  'surgery',
  'medication',
]

const MEMORY_CLASS_MAP: Record<string, DataClass> = {
  motivation_hints: DataClass.SensitiveWellness,
  personality_preferences: DataClass.PersonalCoaching,
  training_patterns: DataClass.PersonalCoaching,
  life_context: DataClass.SensitiveWellness,
}

const TEXT_TELEMETRY_EVENT_TYPES = new Set([
  'agent_reply_received',
  'transcript_committed',
])

export function classifyMemory(category: string, content: string): DataClass {
  const lower = content.toLowerCase()
  if (MEDICAL_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return DataClass.MedicalRehab
  }

  return MEMORY_CLASS_MAP[category] ?? DataClass.PersonalCoaching
}

export function classifyTelemetryEvent(eventType: string): DataClass {
  if (eventType.startsWith('class_d_')) {
    return DataClass.MedicalRehab
  }

  if (TEXT_TELEMETRY_EVENT_TYPES.has(eventType)) {
    return DataClass.PersonalCoaching
  }

  return DataClass.Operational
}
