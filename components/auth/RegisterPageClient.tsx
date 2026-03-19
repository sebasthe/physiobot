'use client'

import { useState } from 'react'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import { useI18n } from '@/components/i18n/I18nProvider'
import AuthForm from '@/components/auth/AuthForm'
import TransitionLink from '@/components/navigation/TransitionLink'
import { useSoftNavigation } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPageClient() {
  const [error, setError] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const { messages } = useI18n()
  const router = useSoftNavigation()

  const handleRegister = async ({ email, password }: { email: string; password: string }) => {
    setIsLoading(true)
    setError(undefined)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
    } else {
      router.push('/onboarding/personality')
    }

    setIsLoading(false)
  }

  return (
    <main className="vital-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="absolute right-5 top-[max(20px,var(--safe-top))] z-20">
        <LanguageToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-8 animate-slide-up md:grid md:max-w-4xl md:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.8fr)] md:items-center md:gap-10 md:space-y-0 lg:max-w-5xl lg:gap-12">
        <div className="text-center md:text-left">
          <div className="text-phase mb-2" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.7rem' }}>
            {messages.auth.registerEyebrow.toUpperCase()}
          </div>
          <h1 className="font-display uppercase" style={{ fontSize: 'clamp(3.4rem, 18vw, 5.6rem)', lineHeight: 0.88 }}>
            {messages.auth.registerTitle.slice(0, -1)}<span style={{ color: 'var(--primary)' }}>.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-white/55 md:mx-0">
            {messages.auth.registerCopy}
          </p>
        </div>
        <div className="space-y-8">
          <AuthForm mode="register" onSubmit={handleRegister} isLoading={isLoading} error={error} />
          <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            {messages.auth.alreadyRegistered}{' '}
            <TransitionLink href="/auth/login" className="underline underline-offset-4 transition-colors" style={{ color: 'var(--primary)' }}>
              {messages.auth.loginLink}
            </TransitionLink>
          </p>
        </div>
      </div>
    </main>
  )
}
