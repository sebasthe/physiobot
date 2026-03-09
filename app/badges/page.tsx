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
    <main className="mx-auto min-h-screen max-w-[430px] px-5 pb-10 pt-8">
      <div className="mb-6">
        <TransitionLink href="/dashboard" className="mb-4 inline-flex text-sm font-semibold text-[var(--teal)]">
          ← Zurück zum Dashboard
        </TransitionLink>
        <div className="text-phase mb-2 text-[var(--teal)]">Fortschritt</div>
        <h1 className="font-display text-5xl leading-none text-[var(--foreground)]">Badges</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          {earnedMap.size} von {ALL_BADGES.length} freigeschaltet.
        </p>
      </div>

      <div className="space-y-3">
        {ALL_BADGES.map(badge => {
          const earnedAt = earnedMap.get(badge.key)
          const earned = Boolean(earnedAt)
          return (
            <div
              key={badge.key}
              className="rounded-[18px] border p-4 shadow-[var(--shadow-sm)]"
              style={{
                borderColor: earned ? 'var(--gold)' : 'var(--border)',
                background: earned ? 'var(--gold-light)' : 'white',
                opacity: earned ? 1 : 0.65,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: earned ? '#fff8e1' : 'var(--sand)' }}>
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
    </main>
  )
}
