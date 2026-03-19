import { cookies } from 'next/headers'
import type { Language } from '@/lib/types'
import { LANGUAGE_COOKIE_NAME, resolveLanguage } from '@/lib/i18n/config'

export async function getRequestLanguage(): Promise<Language> {
  const cookieStore = await cookies()
  return resolveLanguage(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value, 'de')
}
