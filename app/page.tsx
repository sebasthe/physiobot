import { redirect } from 'next/navigation'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import TransitionLink from '@/components/navigation/TransitionLink'
import { getMessages } from '@/lib/i18n/messages'
import { getRequestLanguage } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const locale = await getRequestLanguage()
  const messages = getMessages(locale)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="vital-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="absolute right-5 top-[max(20px,var(--safe-top))] z-20">
        <LanguageToggle />
      </div>

      <div className="relative z-10 text-center space-y-6 animate-slide-up">
        <div className="text-phase" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.7rem' }}>
          {messages.landing.eyebrow.toUpperCase()}
        </div>

        <h1 className="font-display uppercase" style={{ fontSize: 'clamp(4.4rem, 22vw, 7.4rem)', lineHeight: 0.86 }}>
          {messages.common.appWordmarkLead}
          <span style={{ color: 'var(--primary)' }}>Bot</span>
        </h1>

        <p className="mx-auto max-w-xs text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {messages.landing.copy}
        </p>

        <div className="glass-card mx-auto flex w-full max-w-sm flex-col gap-3 rounded-[28px] p-4 pt-5">
          <TransitionLink
            href="/auth/register"
            className="btn-primary inline-flex items-center justify-center rounded-2xl px-8 py-4 font-display text-lg tracking-[0.16em] uppercase"
          >
            {messages.landing.getStarted}
          </TransitionLink>
          <TransitionLink
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-2xl px-8 py-4 text-sm transition-colors hover:bg-white/4"
            style={{ color: 'var(--text-secondary)' }}
          >
            {messages.landing.login}
          </TransitionLink>
        </div>
      </div>
    </main>
  )
}
