import { describe, expect, it, vi } from 'vitest'
import { deleteUserAppData } from '@/lib/privacy/account-delete'

function buildClient(resultByTable: Record<string, { error: { message: string } | null }>) {
  const from = vi.fn((table: string) => ({
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(resultByTable[table] ?? { error: null }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(resultByTable[table] ?? { error: null }),
    }),
  }))

  return { from }
}

describe('deleteUserAppData', () => {
  it('returns no errors when every cleanup query succeeds', async () => {
    const client = buildClient({})

    const result = await deleteUserAppData(client as never, 'user-123')

    expect(result.errors).toEqual([])
    expect(client.from).toHaveBeenCalledWith('pain_log')
    expect(client.from).toHaveBeenCalledWith('voice_telemetry_events')
    expect(client.from).toHaveBeenCalledWith('profiles')
  })

  it('collects delete and profile update errors instead of ignoring them', async () => {
    const client = buildClient({
      pain_log: { error: { message: 'rls denied' } },
      profiles: { error: { message: 'update failed' } },
    })

    const result = await deleteUserAppData(client as never, 'user-123')

    expect(result.errors).toEqual([
      'pain_log: rls denied',
      'profiles: update failed',
    ])
  })
})
