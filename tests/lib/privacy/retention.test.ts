import { describe, expect, it, vi } from 'vitest'
import { enforceRetention } from '@/lib/privacy/retention'
import { DataClass } from '@/lib/privacy/types'

const {
  mockLt,
  mockEqDataClass,
  mockEqUserId,
  mockDelete,
  mockFrom,
} = vi.hoisted(() => {
  const hoistedMockLt = vi.fn().mockResolvedValue({ error: null, count: 5 })
  const hoistedMockEqDataClass = vi.fn().mockReturnValue({ lt: hoistedMockLt })
  const hoistedMockEqUserId = vi.fn().mockReturnValue({ eq: hoistedMockEqDataClass })
  const hoistedMockDelete = vi.fn().mockReturnValue({ eq: hoistedMockEqUserId })
  const hoistedMockFrom = vi.fn().mockReturnValue({ delete: hoistedMockDelete })

  return {
    mockLt: hoistedMockLt,
    mockEqDataClass: hoistedMockEqDataClass,
    mockEqUserId: hoistedMockEqUserId,
    mockDelete: hoistedMockDelete,
    mockFrom: hoistedMockFrom,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
  }),
}))

describe('enforceRetention', () => {
  it('deletes old class a telemetry', async () => {
    const result = await enforceRetention('user-123')

    expect(mockFrom).toHaveBeenCalledWith('voice_telemetry_events')
    expect(mockDelete).toHaveBeenCalledWith({ count: 'exact' })
    expect(mockEqUserId).toHaveBeenCalledWith('user_id', 'user-123')
    expect(mockEqDataClass).toHaveBeenCalledWith('data_class', DataClass.Operational)
    expect(result.deletedCount).toBe(5)
  })
})
