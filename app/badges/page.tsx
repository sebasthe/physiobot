import { redirect } from 'next/navigation'
import TransitionLink from '@/components/navigation/TransitionLink'
import { ALL_BADGES } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

export default async function BadgesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: earnedBadges } = await supabase
    .from('badges_earned')
    .select('badge_key, earned_at')
    .eq('user_id', user.id)

  const earnedMap = new Map(
    (earnedBadges ?? []).map(badge => [badge.badge_key, badge.earned_at])
  )

  return (
    <main className="vital-gradient min-h-screen pb-10 lg:min-h-full">
      <div className="px-5 pt-8 md:px-8 md:pb-8 lg:px-10 lg:pb-10 xl:px-12 xl:pt-14">
        <div className="mb-10 md:flex md:items-end md:justify-between md:gap-8">
          <div>
            <TransitionLink href="/dashboard" className="mb-8 inline-flex items-center gap-2 p-0 text-sm font-semibold text-[var(--accent)] transition-colors hover:text-[color:rgba(42,157,138,0.8)]">
              ← Zurück zum Dashboard
            </TransitionLink>
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.28em] text-[rgba(42,157,138,0.6)]">Fortschritt</span>
            <h1 className="font-display text-6xl uppercase tracking-tight text-white">Badges</h1>
            <p className="mt-2 text-sm text-white/40">
              {earnedMap.size} von {ALL_BADGES.length} freigeschaltet.
            </p>
          </div>
          <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 px-5 py-4 text-xs uppercase tracking-[0.18em] text-white/45 md:mt-0 md:min-w-[15rem] md:text-right">
            Fortschritt auf einen Blick
          </div>
        </div>

        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {ALL_BADGES.map(badge => {
            const earnedAt = earnedMap.get(badge.key)
            const earned = Boolean(earnedAt)
            return (
              <div
                key={badge.key}
                className="rounded-[18px] border p-4 shadow-[var(--shadow-sm)] backdrop-blur-md"
                style={{
                  borderColor: earned ? 'rgba(240,160,75,0.32)' : 'var(--border)',
                  background: earned ? 'rgba(240,160,75,0.12)' : 'var(--card)',
                  opacity: earned ? 1 : 0.65,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: earned ? 'rgba(240,160,75,0.16)' : 'var(--secondary)' }}>
                    {badge.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[var(--text-primary)]">{badge.name}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{badge.description}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs font-medium text-[var(--text-muted)]">
                  {earnedAt
                    ? `Freigeschaltet am ${new Date(earnedAt).toLocaleDateString('de-DE')}`
                    : 'Noch nicht freigeschaltet'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
