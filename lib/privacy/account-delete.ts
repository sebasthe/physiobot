import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export interface DeleteUserAppDataResult {
  errors: string[]
}

function formatCleanupError(scope: string, error: PostgrestError | null) {
  if (!error) return null
  return `${scope}: ${error.message}`
}

export async function deleteUserAppData(
  supabase: Pick<SupabaseClient, 'from'>,
  userId: string
): Promise<DeleteUserAppDataResult> {
  const operations = await Promise.all([
    supabase.from('pain_log').delete().eq('user_id', userId).then(({ error }) => formatCleanupError('pain_log', error)),
    supabase.from('voice_telemetry_events').delete().eq('user_id', userId).then(({ error }) => formatCleanupError('voice_telemetry_events', error)),
    supabase.from('sessions').delete().eq('user_id', userId).then(({ error }) => formatCleanupError('sessions', error)),
    supabase.from('health_profiles').delete().eq('user_id', userId).then(({ error }) => formatCleanupError('health_profiles', error)),
    supabase.from('schedules').delete().eq('user_id', userId).then(({ error }) => formatCleanupError('schedules', error)),
    supabase.from('streaks').delete().eq('user_id', userId).then(({ error }) => formatCleanupError('streaks', error)),
    supabase.from('user_personality').delete().eq('user_id', userId).then(({ error }) => formatCleanupError('user_personality', error)),
    supabase
      .from('profiles')
      .update({
        active_plan_id: null,
        name: null,
        address: null,
        privacy_consent: 'none',
      })
      .eq('id', userId)
      .then(({ error }) => formatCleanupError('profiles', error)),
  ])

  return {
    errors: operations.filter((error): error is string => Boolean(error)),
  }
}
