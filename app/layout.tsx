import type { Metadata } from 'next'
import { Bebas_Neue, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import AppShell from '@/components/layout/AppShell'
import PageTransition from '@/components/navigation/PageTransition'
import { getRequestLanguage } from '@/lib/i18n/server'
import { getMessages } from '@/lib/i18n/messages'
import './globals.css'

const displayFont = Bebas_Neue({
  variable: '--font-display',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
})

const bodyFont = Plus_Jakarta_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const monoFont = Geist_Mono({
  variable: '--font-code',
  subsets: ['latin'],
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLanguage()
  const messages = getMessages(locale)

  return {
    title: 'PhysioCoach',
    description: messages.meta.appDescription,
    manifest: '/manifest.json',
    icons: {
      icon: [
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
      shortcut: ['/favicon.ico'],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'PhysioCoach',
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getRequestLanguage()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0D0B09" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} antialiased`}
      >
        <I18nProvider initialLocale={locale}>
          <AppShell>
            <PageTransition>{children}</PageTransition>
          </AppShell>
        </I18nProvider>
      </body>
    </html>
  )
}
