import type { Language } from '@/lib/types'

const CONSENT_MESSAGES: Record<Language, string> = {
  de:
    'Dieser Trainingsplan enthaelt physiotherapeutische Uebungen. '
    + 'Deine Gesundheitsdaten (Schmerzberichte, Mobilitaetswerte) werden besonders geschuetzt gespeichert. '
    + 'Moechtest du fortfahren?',
  en:
    'This training plan contains physiotherapy exercises. '
    + 'Your health data (pain reports and mobility values) is stored with extra protection. '
    + 'Do you want to continue?',
}

export function getPhysioConsentMessage(language: Language): string {
  return CONSENT_MESSAGES[language]
}

export const PHYSIO_CONSENT_MESSAGE = CONSENT_MESSAGES.de

export function requiresPhysioConsent(plan: { contraindications?: string[] | null }): boolean {
  return (plan.contraindications?.length ?? 0) > 0
}
