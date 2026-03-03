'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Zap, TrendingUp } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'HOME',       icon: Home },
  { href: '/training/session', label: 'TRAINING', icon: Zap },
  { href: '/progress', label: 'FORTSCHRITT', icon: TrendingUp },
]

const HIDE_NAV_PREFIXES = ['/auth', '/onboarding', '/training/session']

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const hideNav = HIDE_NAV_PREFIXES.some(prefix => pathname.startsWith(prefix))

  return (
    <div className="relative min-h-screen max-w-[430px] mx-auto">
      <main
        className="w-full"
        style={{ paddingBottom: hideNav ? '0' : 'calc(var(--nav-height) + var(--safe-bottom))' }}
      >
        {children}
      </main>

      {!hideNav && (
        <nav className="bottom-nav">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href !== '/training/session' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item relative ${isActive ? 'nav-item--active' : ''}`}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                <span className="nav-label">{label}</span>
                {isActive && <span className="progress-dot" />}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
