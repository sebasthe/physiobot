'use client'

import { usePathname } from 'next/navigation'
import { Calendar, ChevronRight, Flame, Trophy, User } from 'lucide-react'
import TransitionLink from '@/components/navigation/TransitionLink'

const PRIMARY_NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Flame },
  { href: '/plan', label: 'Plan', icon: Calendar },
  { href: '/badges', label: 'Badges', icon: Trophy },
  { href: '/settings', label: 'Profil', icon: User },
]

const HIDE_NAV_PREFIXES = ['/auth', '/onboarding', '/training/session', '/training/feedback']
const HIDE_NAV_EXACT = ['/']

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const hideNav = HIDE_NAV_EXACT.includes(pathname) || HIDE_NAV_PREFIXES.some(prefix => pathname.startsWith(prefix))

  return (
    <div className={`app-shell ${hideNav ? 'app-shell--navless' : 'app-shell--with-nav'}`}>
      {!hideNav && (
        <aside className="desktop-sidebar">
          <div className="desktop-sidebar__panel">
            <div className="desktop-sidebar__brand">
              <div className="desktop-sidebar__eyebrow">PhysioCoach</div>
              <div className="desktop-sidebar__title">Dein Trainingsraum</div>
              <p className="desktop-sidebar__copy">
                Dashboard, Plan, Badges und Profil bleiben auf Desktop direkt erreichbar.
              </p>
            </div>

            <nav className="desktop-nav" aria-label="Hauptnavigation">
              {PRIMARY_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
              <div className="desktop-sidebar__section-label">Workspace</div>
              <p className="desktop-sidebar__meta-copy">
                Mobile bleibt kompakt. Desktop bekommt mehr Breite, klare Hierarchie und eine feste Navigation.
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
            {PRIMARY_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
