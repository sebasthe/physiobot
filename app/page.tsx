import { redirect } from 'next/navigation'
import TransitionLink from '@/components/navigation/TransitionLink'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="vital-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="relative z-10 text-center space-y-6 animate-slide-up">
        <div className="text-phase" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.7rem' }}>
          DEIN COACH WARTET
        </div>

        <h1 className="font-display uppercase" style={{ fontSize: 'clamp(4.4rem, 22vw, 7.4rem)', lineHeight: 0.86 }}>
          Physio
          <span style={{ color: 'var(--primary)' }}>Bot</span>
        </h1>

        <p className="mx-auto max-w-xs text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Personalisierte Physiotherapie mit KI-Coach — abgestimmt auf dich.
        </p>

        <div className="glass-card mx-auto flex w-full max-w-sm flex-col gap-3 rounded-[28px] p-4 pt-5">
          <TransitionLink
            href="/auth/register"
            className="btn-primary inline-flex items-center justify-center rounded-2xl px-8 py-4 font-display text-lg tracking-[0.16em] uppercase"
          >
            Loslegen
          </TransitionLink>
          <TransitionLink
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-2xl px-8 py-4 text-sm transition-colors hover:bg-white/4"
            style={{ color: 'var(--text-secondary)' }}
          >
            Bereits registriert? Anmelden
          </TransitionLink>
        </div>
      </div>
    </main>
  )
}
