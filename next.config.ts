import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

let exportedConfig: NextConfig

try {
  // next-pwa is optional — if not configured (e.g. missing types), fall back to plain config
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withPWA = require('next-pwa')
  exportedConfig = withPWA({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    register: true,
    skipWaiting: true,
  })(nextConfig)
} catch {
  exportedConfig = nextConfig
}

export default exportedConfig
