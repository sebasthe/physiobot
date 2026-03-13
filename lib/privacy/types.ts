export enum DataClass {
  Operational = 'A',
  PersonalCoaching = 'B',
  SensitiveWellness = 'C',
  MedicalRehab = 'D',
}

export const RETENTION_DAYS: Record<DataClass, number | null> = {
  [DataClass.Operational]: 90,
  [DataClass.PersonalCoaching]: null,
  [DataClass.SensitiveWellness]: null,
  [DataClass.MedicalRehab]: null,
}

export type ConsentLevel = 'full' | 'minimal' | 'none'

export interface ClassifiedData {
  dataClass: DataClass
  content: unknown
  createdAt: string
  userId: string
}

const DATA_CLASS_VALUES = new Set(Object.values(DataClass))
const CONSENT_LEVEL_VALUES = new Set<ConsentLevel>(['full', 'minimal', 'none'])

export function isValidDataClass(value: unknown): value is DataClass {
  return typeof value === 'string' && DATA_CLASS_VALUES.has(value as DataClass)
}

export function isValidConsentLevel(value: unknown): value is ConsentLevel {
  return typeof value === 'string' && CONSENT_LEVEL_VALUES.has(value as ConsentLevel)
}

export function resolveConsentLevel(value: unknown, fallback: ConsentLevel = 'full'): ConsentLevel {
  return isValidConsentLevel(value) ? value : fallback
}
