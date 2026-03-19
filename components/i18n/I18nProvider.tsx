'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import type { Language } from '@/lib/types'
import { getMessages, type AppMessages } from '@/lib/i18n/messages'

interface I18nContextValue {
  locale: Language
  messages: AppMessages
  setLocale: (locale: Language) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Language
  children: React.ReactNode
}) {
  const [locale, setLocale] = useState<Language>(initialLocale)
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    messages: getMessages(locale),
    setLocale,
  }), [locale])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used within I18nProvider')
  }

  return value
}
