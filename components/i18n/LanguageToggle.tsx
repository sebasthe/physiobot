'use client'

import { useRouter } from 'next/navigation'
import { startTransition } from 'react'
import type { Language } from '@/lib/types'
import { persistLanguageCookie } from '@/lib/i18n/client'
import { useI18n } from '@/components/i18n/I18nProvider'

export default function LanguageToggle() {
  const router = useRouter()
  const { locale, messages, setLocale } = useI18n()

  const updateLanguage = (nextLanguage: Language) => {
    if (nextLanguage === locale) return

    persistLanguageCookie(nextLanguage)
    setLocale(nextLanguage)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => updateLanguage('de')}
        className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${locale === 'de' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/72'}`}
      >
        {messages.common.languageShortDe}
      </button>
      <button
        type="button"
        onClick={() => updateLanguage('en')}
        className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${locale === 'en' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/72'}`}
      >
        {messages.common.languageShortEn}
      </button>
    </div>
  )
}
