import { createClient } from '@/lib/supabase/server'
import { DataClass } from './types'

interface PrivacyAuditInput {
  userId: string
  sessionId?: string | null
  eventType: string
  payload?: Record<string, unknown>
  dataClass?: DataClass
  supabase?: {
    from: (table: string) => {
      insert: (value: Record<string, unknown>) => PromiseLike<unknown> | unknown
    }
  }
}

export async function logPrivacyAuditEvent(input: PrivacyAuditInput): Promise<void> {
  const supabase = input.supabase ?? await createClient()

  await supabase.from('voice_telemetry_events').insert({
    user_id: input.userId,
    session_id: input.sessionId ?? null,
    event_type: input.eventType,
    payload: input.payload ?? {},
    data_class: input.dataClass ?? DataClass.Operational,
  })
}
