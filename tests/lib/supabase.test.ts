import { describe, it, expect, vi } from 'vitest'

// Stub env vars before importing the client so createBrowserClient doesn't throw
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')

import { createClient } from '@/lib/supabase/client'

describe('supabase client', () => {
  it('creates a client without throwing', () => {
    expect(() => createClient()).not.toThrow()
  })
})
