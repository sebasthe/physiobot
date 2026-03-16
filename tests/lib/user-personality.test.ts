import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_USER_PERSONALITY, saveUserLanguagePreference } from '@/lib/user-personality'

function buildClient(updateResult: { data: { user_id: string } | null; error: { message: string } | null }, insertResult = { error: null as { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(updateResult)
  const select = vi.fn().mockReturnValue({ maybeSingle })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  const insert = vi.fn().mockResolvedValue(insertResult)
  const from = vi.fn().mockReturnValue({ update, insert })

  return {
    client: { from },
    mocks: { from, update, eq, select, maybeSingle, insert },
  }
}

describe('saveUserLanguagePreference', () => {
  it('updates an existing personality row without inserting defaults', async () => {
    const client = buildClient({ data: { user_id: 'user-123' }, error: null })

    const result = await saveUserLanguagePreference(client.client as never, 'user-123', 'en')

    expect(result.error).toBeNull()
    expect(client.mocks.update).toHaveBeenCalledWith({ language: 'en' })
    expect(client.mocks.insert).not.toHaveBeenCalled()
  })

  it('inserts a default personality row when none exists yet', async () => {
    const client = buildClient({ data: null, error: null })

    const result = await saveUserLanguagePreference(client.client as never, 'user-123', 'en')

    expect(result.error).toBeNull()
    expect(client.mocks.insert).toHaveBeenCalledWith({
      user_id: 'user-123',
      ...DEFAULT_USER_PERSONALITY,
      language: 'en',
    })
  })

  it('stops when the update query itself fails', async () => {
    const client = buildClient({ data: null, error: { message: 'boom' } })

    const result = await saveUserLanguagePreference(client.client as never, 'user-123', 'en')

    expect(result.error).toEqual({ message: 'boom' })
    expect(client.mocks.insert).not.toHaveBeenCalled()
  })
})
