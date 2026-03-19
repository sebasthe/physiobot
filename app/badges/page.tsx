import { redirect } from 'next/navigation'
import TransitionLink from '@/components/navigation/TransitionLink'
import { toLocaleTag } from '@/lib/i18n/config'
import { formatTemplate } from '@/lib/i18n/format'
import { getMessages } from '@/lib/i18n/messages'
import { getRequestLanguage } from '@/lib/i18n/server'
import { ALL_BADGES } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

export default async function BadgesPage() {
  const locale = await getRequestLanguage()
  const messages = getMessages(locale)
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
      <div className="px-5 pt-6 md:px-8 md:pb-8 lg:px-10 lg:pb-10 xl:px-12 xl:pt-14">
        <section className="surface-card mb-5 rounded-[1.85rem] p-4 md:mb-10 md:rounded-[2rem] md:p-7">
          <div className="md:flex md:items-end md:justify-between md:gap-8">
            <div>
              <TransitionLink href="/dashboard" className="mb-4 inline-flex items-center gap-2 p-0 text-sm font-semibold text-[var(--accent)] transition-colors hover:text-[color:rgba(42,157,138,0.8)]">
                {messages.common.backToDashboard}
              </TransitionLink>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.28em] text-[rgba(42,157,138,0.6)]">{messages.badges.eyebrow}</span>
              <h1 className="font-display text-[clamp(2.45rem,11.5vw,4.9rem)] uppercase leading-[0.94] tracking-tight text-white">{messages.badges.title}</h1>
              <p className="mt-2.5 text-sm leading-6 text-white/46 md:mt-3 md:leading-7">
                {formatTemplate(messages.badges.summary, { earned: earnedMap.size, total: ALL_BADGES.length })}
              </p>
            </div>
            <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-white/45 md:mt-0 md:min-w-[15rem] md:text-right md:text-xs">
              {messages.badges.glance}
            </div>
          </div>
        </section>

        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {ALL_BADGES.map(badge => {
            const earnedAt = earnedMap.get(badge.key)
            const earned = Boolean(earnedAt)
            const badgeCopy = messages.badgesCatalog[badge.key]
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
                    <div className="text-sm font-bold text-[var(--text-primary)]">{badgeCopy.name}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{badgeCopy.description}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs font-medium text-[var(--text-muted)]">
                  {earnedAt
                    ? formatTemplate(messages.badges.unlockedOn, { date: new Date(earnedAt).toLocaleDateString(toLocaleTag(locale)) })
                    : messages.badges.locked}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
