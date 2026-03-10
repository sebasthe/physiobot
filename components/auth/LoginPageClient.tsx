'use client'

import { useState } from 'react'
import AuthForm from '@/components/auth/AuthForm'
import TransitionLink from '@/components/navigation/TransitionLink'
import { useSoftNavigation } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPageClient() {
  const [error, setError] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const router = useSoftNavigation()

  const handleLogin = async ({ email, password }: { email: string; password: string }) => {
    setIsLoading(true)
    setError(undefined)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }

    setIsLoading(false)
  }

  return (
    <main className="vital-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="relative z-10 w-full max-w-sm space-y-8 animate-slide-up md:grid md:max-w-4xl md:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.8fr)] md:items-center md:gap-10 md:space-y-0 lg:max-w-5xl lg:gap-12">
        <div className="text-center md:text-left">
          <div className="text-phase mb-2" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.7rem' }}>
            WILLKOMMEN ZURUECK
          </div>
          <h1 className="font-display uppercase" style={{ fontSize: 'clamp(3.4rem, 18vw, 5.6rem)', lineHeight: 0.88 }}>
            Physio<span style={{ color: 'var(--primary)' }}>Bot</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-white/55 md:mx-0">
            Desktop und Landscape bekommen mehr Raum. Dein Einstieg bleibt schnell, aber nicht mehr auf Mobile-Breite fixiert.
          </p>
        </div>
        <div className="space-y-8">
          <AuthForm mode="login" onSubmit={handleLogin} isLoading={isLoading} error={error} />
          <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Noch kein Account?{' '}
            <TransitionLink href="/auth/register" className="underline underline-offset-4 transition-colors" style={{ color: 'var(--primary)' }}>
              Registrieren
            </TransitionLink>
          </p>
        </div>
      </div>
    </main>
  )
}
