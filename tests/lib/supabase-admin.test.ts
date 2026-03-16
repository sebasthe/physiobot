import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSupabaseClient = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: createSupabaseClient,
}))

describe('createAdminClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  })

  it('prefers SUPABASE_SECRET_KEY when present', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_new')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy_service_role')

    const { createAdminClient } = await import('@/lib/supabase/admin')
    createAdminClient()

    expect(createSupabaseClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'sb_secret_new',
      expect.any(Object)
    )
  })

  it('falls back to SUPABASE_SERVICE_ROLE_KEY for older environments', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy_service_role')

    const { createAdminClient } = await import('@/lib/supabase/admin')
    createAdminClient()

    expect(createSupabaseClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'legacy_service_role',
      expect.any(Object)
    )
  })

  it('returns null when no server secret is configured', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')

    expect(createAdminClient()).toBeNull()
    expect(createSupabaseClient).not.toHaveBeenCalled()
  })
})
