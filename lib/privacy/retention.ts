import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { DataClass, RETENTION_DAYS } from './types'

export interface RetentionResult {
  deletedCount: number
}

export async function enforceRetention(userId: string): Promise<RetentionResult> {
  const supabase = createAdminClient() ?? await createClient()
  let deletedCount = 0

  const retentionDays = RETENTION_DAYS[DataClass.Operational]
  if (retentionDays !== null) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    const { count, error } = await supabase
      .from('voice_telemetry_events')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('data_class', DataClass.Operational)
      .lt('created_at', cutoff)

    if (error) {
      throw error
    }

    deletedCount += count ?? 0
  }

  return { deletedCount }
}
