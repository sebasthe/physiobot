import type { Language } from '@/lib/types'
import { LANGUAGE_COOKIE_NAME } from '@/lib/i18n/config'

export function persistLanguageCookie(language: Language) {
  if (typeof document === 'undefined') return

  document.cookie = [
    `${LANGUAGE_COOKIE_NAME}=${language}`,
    'Path=/',
    'Max-Age=31536000',
    'SameSite=Lax',
  ].join('; ')
}
