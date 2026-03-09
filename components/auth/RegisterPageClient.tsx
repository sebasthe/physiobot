'use client'

import { useState } from 'react'
import AuthForm from '@/components/auth/AuthForm'
import TransitionLink from '@/components/navigation/TransitionLink'
import { useSoftNavigation } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPageClient() {
  const [error, setError] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
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
    <main className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(240,160,75,0.06) 0%, transparent 60%)' }}
      />
      <div className="relative z-10 w-full max-w-sm space-y-8 animate-slide-up">
        <div className="text-center">
          <div className="text-phase mb-2" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.7rem' }}>
            STARTE DEINE REISE
          </div>
          <h1 className="font-display uppercase" style={{ fontSize: 'clamp(3rem, 15vw, 5rem)', lineHeight: 0.9 }}>
            Konto<span style={{ color: 'var(--primary)' }}>.</span>
          </h1>
        </div>
        <AuthForm mode="register" onSubmit={handleRegister} isLoading={isLoading} error={error} />
        <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Bereits registriert?{' '}
          <TransitionLink href="/auth/login" className="underline underline-offset-4 transition-colors" style={{ color: 'var(--primary)' }}>
            Anmelden
          </TransitionLink>
        </p>
      </div>
    </main>
  )
}
