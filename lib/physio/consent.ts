export const PHYSIO_CONSENT_MESSAGE =
  'Dieser Trainingsplan enthaelt physiotherapeutische Uebungen. ' +
  'Deine Gesundheitsdaten (Schmerzberichte, Mobilitaetswerte) werden besonders geschuetzt gespeichert. ' +
  'Moechtest du fortfahren?'

export function requiresPhysioConsent(plan: { contraindications?: string[] | null }): boolean {
  return (plan.contraindications?.length ?? 0) > 0
}
