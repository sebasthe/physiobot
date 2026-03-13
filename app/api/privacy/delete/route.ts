import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import MemoryClient from 'mem0ai'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Mem0Client {
  deleteAll: (options: { user_id: string }) => Promise<unknown>
}

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
}) as unknown as Mem0Client

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await mem0.deleteAll({ user_id: user.id }).catch(() => undefined)

  let deletedAuthUser = false
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceRoleKey) {
    const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { error } = await adminClient.auth.admin.deleteUser(user.id)
    deletedAuthUser = !error
  }

  if (!deletedAuthUser) {
    await Promise.all([
      supabase.from('pain_log').delete().eq('user_id', user.id),
      supabase.from('voice_telemetry_events').delete().eq('user_id', user.id),
      supabase.from('sessions').delete().eq('user_id', user.id),
      supabase.from('health_profiles').delete().eq('user_id', user.id),
      supabase.from('schedules').delete().eq('user_id', user.id),
      supabase.from('streaks').delete().eq('user_id', user.id),
      supabase.from('user_personality').delete().eq('user_id', user.id),
      supabase
        .from('profiles')
        .update({
          active_plan_id: null,
          name: null,
          address: null,
          privacy_consent: 'none',
        })
        .eq('id', user.id),
    ]).catch(() => undefined)
  }

  await supabase.auth.signOut().catch(() => undefined)

  return NextResponse.json({
    success: true,
    deletedAuthUser,
  })
}
