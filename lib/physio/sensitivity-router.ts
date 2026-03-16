export type SensitivityLevel = 'normal' | 'elevated' | 'high'

export interface SensitivityResult {
  level: SensitivityLevel
  signals: string[]
}

interface PatternDefinition {
  pattern: RegExp
  signal: string
  level: SensitivityLevel
}

const PATTERNS: PatternDefinition[] = [
  { pattern: /diagnos/i, signal: 'diagnosis_mention', level: 'high' },
  { pattern: /bandscheib/i, signal: 'spinal_condition', level: 'high' },
  { pattern: /arthr(ose|itis)/i, signal: 'joint_condition', level: 'high' },
  { pattern: /operati(on|ert|ve)/i, signal: 'surgery_mention', level: 'high' },
  { pattern: /\breha\b/i, signal: 'rehab_mention', level: 'high' },
  { pattern: /befund/i, signal: 'medical_finding', level: 'high' },
  { pattern: /(stechend|ziehend|brennend|ausstrahlend).{0,20}(schmerz|weh|pain)/i, signal: 'specific_pain', level: 'high' },
  { pattern: /seit\s+\d+\s+(tag|tage|woche|wochen|monat|monate)/i, signal: 'chronic_duration', level: 'high' },
  { pattern: /medikament|ibuprofen|voltaren|tablette|medication/i, signal: 'medication_mention', level: 'elevated' },
  { pattern: /(tut|ist).{0,24}weh/i, signal: 'pain_general', level: 'elevated' },
  { pattern: /schmerz|pain/i, signal: 'pain_word', level: 'elevated' },
  { pattern: /schwindel|übel|uebel|kribbel|taub|numb|tingl/i, signal: 'neurological_symptom', level: 'elevated' },
  { pattern: /blutdruck|herzrasen|atemnot|shortness of breath/i, signal: 'cardiovascular_symptom', level: 'elevated' },
]

export function classifySensitivity(text: string): SensitivityResult {
  let level: SensitivityLevel = 'normal'
  const signals: string[] = []

  for (const { pattern, signal, level: detectedLevel } of PATTERNS) {
    if (!pattern.test(text)) {
      continue
    }

    signals.push(signal)
    if (detectedLevel === 'high') {
      level = 'high'
    } else if (detectedLevel === 'elevated' && level === 'normal') {
      level = 'elevated'
    }
  }

  return { level, signals }
}
