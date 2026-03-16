import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { enforceRetention } from '@/lib/privacy/retention'
import { DataClass } from '@/lib/privacy/types'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

function buildClient(result: { count: number | null; error: Error | null }) {
  const lt = vi.fn().mockResolvedValue(result)
  const eqDataClass = vi.fn().mockReturnValue({ lt })
  const eqUserId = vi.fn().mockReturnValue({ eq: eqDataClass })
  const del = vi.fn().mockReturnValue({ eq: eqUserId })
  const from = vi.fn().mockReturnValue({ delete: del })

  return {
    client: { from },
    mocks: { from, del, eqUserId, eqDataClass, lt },
  }
}

describe('enforceRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the admin client when one is configured', async () => {
    const admin = buildClient({ count: 5, error: null })
    vi.mocked(createAdminClient).mockReturnValue(admin.client as never)

    const result = await enforceRetention('user-123')

    expect(admin.mocks.from).toHaveBeenCalledWith('voice_telemetry_events')
    expect(admin.mocks.del).toHaveBeenCalledWith({ count: 'exact' })
    expect(admin.mocks.eqUserId).toHaveBeenCalledWith('user_id', 'user-123')
    expect(admin.mocks.eqDataClass).toHaveBeenCalledWith('data_class', DataClass.Operational)
    expect(createClient).not.toHaveBeenCalled()
    expect(result.deletedCount).toBe(5)
  })

  it('falls back to the request client when no admin client exists', async () => {
    const server = buildClient({ count: 2, error: null })
    vi.mocked(createAdminClient).mockReturnValue(null)
    vi.mocked(createClient).mockResolvedValue(server.client as never)

    const result = await enforceRetention('user-123')

    expect(createClient).toHaveBeenCalledTimes(1)
    expect(server.mocks.from).toHaveBeenCalledWith('voice_telemetry_events')
    expect(result.deletedCount).toBe(2)
  })

  it('throws when telemetry deletion returns an error', async () => {
    const failure = new Error('delete blocked by RLS')
    const server = buildClient({ count: null, error: failure })
    vi.mocked(createAdminClient).mockReturnValue(null)
    vi.mocked(createClient).mockResolvedValue(server.client as never)

    await expect(enforceRetention('user-123')).rejects.toThrow('delete blocked by RLS')
  })
})
