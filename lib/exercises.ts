import type { Exercise, Language, StoredExercise, StoredExerciseTranslation } from '@/lib/types'

export function normalizeStoredExercises(rawExercises: unknown, fallbackLanguage: Language): StoredExercise[] {
  if (!Array.isArray(rawExercises)) return []

  return rawExercises.map((rawExercise, index) => normalizeStoredExercise(rawExercise, index, fallbackLanguage))
}

export function localizeExercises(rawExercises: unknown, language: Language, fallbackLanguage: Language = language): Exercise[] {
  return normalizeStoredExercises(rawExercises, fallbackLanguage).map(exercise => localizeExercise(exercise, language))
}

export function localizeExercise(exercise: StoredExercise, language: Language): Exercise {
  const translation = resolveExerciseTranslation(exercise, language)

  return {
    id: exercise.id,
    phase: exercise.phase,
    duration_seconds: exercise.duration_seconds,
    repetitions: exercise.repetitions,
    sets: exercise.sets,
    name: translation.name,
    description: translation.description,
    voice_script: translation.voice_script,
  }
}

function normalizeStoredExercise(rawExercise: unknown, index: number, fallbackLanguage: Language): StoredExercise {
  const exercise = isRecord(rawExercise) ? rawExercise : {}
  const phase = exercise.phase === 'warmup' || exercise.phase === 'main' || exercise.phase === 'cooldown'
    ? exercise.phase
    : 'main'

  const directTranslation = readDirectTranslation(exercise)
  const existingTranslations = readTranslations(exercise.translations)
  const translations = Object.keys(existingTranslations).length > 0
    ? existingTranslations
    : directTranslation
      ? buildFallbackTranslations(directTranslation)
      : buildFallbackTranslations({
          name: `Exercise ${index + 1}`,
          description: '',
          voice_script: '',
        })

  const firstTranslation = resolveFirstTranslation(translations)

  return {
    id: typeof exercise.id === 'string' && exercise.id.trim().length > 0
      ? exercise.id.trim()
      : createCanonicalExerciseId(firstTranslation.name, index),
    phase,
    duration_seconds: toFiniteNumber(exercise.duration_seconds),
    repetitions: toFiniteNumber(exercise.repetitions),
    sets: toFiniteNumber(exercise.sets),
    translations: ensureFallbackTranslations(translations, fallbackLanguage),
  }
}

function readDirectTranslation(exercise: Record<string, unknown>): StoredExerciseTranslation | null {
  if (typeof exercise.name !== 'string' || typeof exercise.description !== 'string' || typeof exercise.voice_script !== 'string') {
    return null
  }

  return {
    name: exercise.name,
    description: exercise.description,
    voice_script: exercise.voice_script,
  }
}

function readTranslations(rawTranslations: unknown): Partial<Record<Language, StoredExerciseTranslation>> {
  if (!isRecord(rawTranslations)) return {}

  const nextTranslations: Partial<Record<Language, StoredExerciseTranslation>> = {}
  for (const language of ['de', 'en'] as const) {
    const rawTranslation = rawTranslations[language]
    if (!isRecord(rawTranslation)) continue

    const name = typeof rawTranslation.name === 'string' ? rawTranslation.name : null
    const description = typeof rawTranslation.description === 'string' ? rawTranslation.description : null
    const voiceScript = typeof rawTranslation.voice_script === 'string' ? rawTranslation.voice_script : null

    if (!name || !description || !voiceScript) continue

    nextTranslations[language] = {
      name,
      description,
      voice_script: voiceScript,
    }
  }

  return nextTranslations
}

function buildFallbackTranslations(translation: StoredExerciseTranslation): Partial<Record<Language, StoredExerciseTranslation>> {
  return {
    de: translation,
    en: translation,
  }
}

function ensureFallbackTranslations(
  translations: Partial<Record<Language, StoredExerciseTranslation>>,
  fallbackLanguage: Language,
): Partial<Record<Language, StoredExerciseTranslation>> {
  const fallbackTranslation = translations[fallbackLanguage]
    ?? translations.de
    ?? translations.en

  if (!fallbackTranslation) {
    return buildFallbackTranslations({
      name: 'Exercise',
      description: '',
      voice_script: '',
    })
  }

  return {
    de: translations.de ?? fallbackTranslation,
    en: translations.en ?? fallbackTranslation,
  }
}

function resolveExerciseTranslation(exercise: StoredExercise, language: Language): StoredExerciseTranslation {
  return exercise.translations[language]
    ?? exercise.translations.de
    ?? exercise.translations.en
    ?? {
      name: exercise.id,
      description: '',
      voice_script: '',
    }
}

function resolveFirstTranslation(translations: Partial<Record<Language, StoredExerciseTranslation>>): StoredExerciseTranslation {
  return translations.de ?? translations.en ?? {
    name: 'exercise',
    description: '',
    voice_script: '',
  }
}

function createCanonicalExerciseId(name: string, index: number): string {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return base.length > 0 ? `${base}-${index + 1}` : `exercise-${index + 1}`
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
