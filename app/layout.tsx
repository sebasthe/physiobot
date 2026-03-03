import type { Metadata } from 'next'
import { Bebas_Neue, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const bebasNeue = Bebas_Neue({
  variable: '--font-display',
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
})

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PhysioBot',
  description: 'Dein AI-Physiotherapie-Coach',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PhysioBot',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de" className="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0D0B09" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body
        className={`${bebasNeue.variable} ${plusJakartaSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
