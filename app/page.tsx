import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 60%, rgba(240,160,75,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 text-center space-y-6 animate-slide-up">
        <div className="text-phase" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.7rem' }}>
          DEIN COACH WARTET
        </div>

        <h1 className="font-display uppercase" style={{ fontSize: 'clamp(4rem, 20vw, 7rem)', lineHeight: 0.9 }}>
          Physio
          <span style={{ color: 'var(--primary)' }}>Bot</span>
        </h1>

        <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Personalisierte Physiotherapie mit KI-Coach — abgestimmt auf dich.
        </p>

        <div className="flex flex-col gap-3 pt-4">
          <Link
            href="/auth/register"
            className="btn-primary inline-flex items-center justify-center rounded-xl px-8 py-4 font-display text-lg tracking-widest uppercase"
          >
            Loslegen
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-xl px-8 py-4 text-sm transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            Bereits registriert? Anmelden
          </Link>
        </div>
      </div>
    </main>
  )
}
