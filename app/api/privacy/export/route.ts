import MemoryClient from 'mem0ai'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface MemoryRecord {
  id: string
  memory: string
  created_at?: string
  metadata?: Record<string, unknown> | null
}

interface Mem0Client {
  getAll: (options: { user_id: string }) => Promise<MemoryRecord[]>
}

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
}) as unknown as Mem0Client

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [
    memories,
    { data: profile },
    { data: sessions },
    { data: healthProfile },
    { data: personality },
    { data: schedule },
    { data: telemetry },
    { data: painLog },
  ] = await Promise.all([
    mem0.getAll({ user_id: user.id }).catch(() => []),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('health_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_personality').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('schedules').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('voice_telemetry_events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('pain_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile,
    healthProfile,
    personality,
    schedule,
    sessions: sessions ?? [],
    telemetry: telemetry ?? [],
    painLog: painLog ?? [],
    memories: memories ?? [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="physiobot-export-${user.id}.json"`,
    },
  })
}
