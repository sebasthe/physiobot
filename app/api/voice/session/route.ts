import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude/client'
import { buildDrMiaSystemPrompt } from '@/lib/claude/prompts'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext, type TranscriptMessage } from '@/lib/mem0'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    messages?: TranscriptMessage[]
    currentExercise?: { name?: string; description?: string; phase?: string }
    sessionNumber?: number
  }

  const [{ data: healthProfile }, { data: profile }, { data: streakRow }, { data: sessions }] = await Promise.all([
    supabase.from('health_profiles').select('complaints').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('name').eq('id', user.id).maybeSingle(),
    supabase.from('streaks').select('current').eq('user_id', user.id).maybeSingle(),
    supabase.from('sessions').select('created_at, completed_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
  ])

  const memoryContext = await getSessionContext(user.id).catch(() => ({
    kernMotivation: null,
    personalityHints: [],
    patternHints: [],
    lifeContext: [],
  }))

  const nowHour = new Date().getHours()
  const timeOfDay = nowHour < 11 ? 'morning' : nowHour < 17 ? 'midday' : 'evening'
  const lastSession = sessions?.[0]
    ? {
        date: new Date(sessions[0].created_at).toLocaleDateString('de-DE'),
        duration: 0,
        completedAll: Boolean(sessions[0].completed_at),
      }
    : undefined

  const system = buildDrMiaSystemPrompt({
    userName: profile?.name ?? 'du',
    streak: streakRow?.current ?? 0,
    bodyAreas: healthProfile?.complaints ?? [],
    memoryContext,
    timeOfDay,
    lastSession,
    sessionNumber: body.sessionNumber ?? 1,
  })

  const contextMessage = body.currentExercise?.name
    ? `Aktuelle Übung: ${body.currentExercise.name}. Beschreibung: ${body.currentExercise.description ?? 'keine zusätzliche Beschreibung'}. Phase: ${body.currentExercise.phase ?? 'main'}.`
    : 'Aktuell läuft eine Physio-Session.'

  const messages = [
    { role: 'user' as const, content: contextMessage },
    ...(body.messages ?? []).map(message => ({
      role: message.role,
      content: message.content,
    })),
  ]

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
    messages,
  })

  const content = response.content.find(item => item.type === 'text')
  if (!content || content.type !== 'text') {
    return NextResponse.json({ error: 'No response text returned' }, { status: 502 })
  }

  return NextResponse.json({ reply: content.text.trim() })
}
