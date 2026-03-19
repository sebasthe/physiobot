import type { Language } from '@/lib/types'

export const LANGUAGE_COOKIE_NAME = 'physiobot-language'
export const SUPPORTED_LANGUAGES: Language[] = ['de', 'en']

export function isSupportedLanguage(value: unknown): value is Language {
  return value === 'de' || value === 'en'
}

export function resolveLanguage(value: unknown, fallback: Language = 'de'): Language {
  return isSupportedLanguage(value) ? value : fallback
}

export function toLocaleTag(language: Language): string {
  return language === 'en' ? 'en-US' : 'de-DE'
}
