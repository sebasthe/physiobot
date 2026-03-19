'use client'

import { usePathname } from 'next/navigation'
import { Calendar, ChevronRight, Flame, Trophy, User } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import TransitionLink from '@/components/navigation/TransitionLink'

const HIDE_NAV_PREFIXES = ['/auth', '/onboarding', '/training/session', '/training/feedback']
const HIDE_NAV_EXACT = ['/']

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const { messages } = useI18n()
  const hideNav = HIDE_NAV_EXACT.includes(pathname) || HIDE_NAV_PREFIXES.some(prefix => pathname.startsWith(prefix))
  const primaryNavItems = [
    { href: '/dashboard', label: messages.nav.home, icon: Flame },
    { href: '/plan', label: messages.nav.plan, icon: Calendar },
    { href: '/badges', label: messages.nav.badges, icon: Trophy },
    { href: '/settings', label: messages.nav.profile, icon: User },
  ]

  return (
    <div className={`app-shell ${hideNav ? 'app-shell--navless' : 'app-shell--with-nav'}`}>
      {!hideNav && (
        <aside className="desktop-sidebar">
          <div className="desktop-sidebar__panel">
            <div className="desktop-sidebar__brand">
              <div className="desktop-sidebar__eyebrow">{messages.common.appName}</div>
              <div className="desktop-sidebar__title">{messages.nav.desktopTitle}</div>
              <p className="desktop-sidebar__copy">
                {messages.nav.desktopCopy}
              </p>
            </div>

            <nav className="desktop-nav" aria-label="Hauptnavigation">
              {primaryNavItems.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(`${href}/`)
                return (
                  <TransitionLink
                    key={href}
                    href={href}
                    className={`desktop-nav__item ${isActive ? 'desktop-nav__item--active' : ''}`}
                  >
                    <span className="desktop-nav__item-main">
                      <span className="desktop-nav__icon">
                        <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                      </span>
                      <span>{label}</span>
                    </span>
                    <ChevronRight size={16} className="desktop-nav__chevron" />
                  </TransitionLink>
                )
              })}
            </nav>

            <div className="desktop-sidebar__meta">
              <div className="desktop-sidebar__section-label">{messages.nav.workspace}</div>
              <p className="desktop-sidebar__meta-copy">
                {messages.nav.desktopMeta}
              </p>
            </div>
          </div>
        </aside>
      )}

      <main
        className={`app-shell__content ${hideNav ? 'app-shell__content--navless' : 'app-shell__content--with-nav'}`}
        style={{ paddingBottom: hideNav ? '0' : 'calc(var(--nav-height) + var(--safe-bottom))' }}
      >
        {children}
      </main>

      {!hideNav && (
        <div className="bottom-nav-shell">
          <nav className="bottom-nav">
            {primaryNavItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <TransitionLink
                  key={href}
                  href={href}
                  className={`nav-item relative ${isActive ? 'nav-item--active' : ''}`}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 1.75}
                  />
                  <span className="nav-label">{label}</span>
                </TransitionLink>
              )
            })}
          </nav>
        </div>
      )}
    </div>
  )
}
