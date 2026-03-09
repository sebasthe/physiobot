import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { TranscriptMessage } from '@/lib/mem0'
import { runVoiceTurnOrchestration } from '@/lib/voice/server-orchestrator'

export async function POST(request: Request) {
  const startedAt = Date.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    messages?: TranscriptMessage[]
    currentExercise?: { name?: string; description?: string; phase?: string }
    sessionNumber?: number
  }

  try {
    const result = await runVoiceTurnOrchestration(supabase, {
      userId: user.id,
      messages: body.messages,
      currentExercise: body.currentExercise,
      sessionNumber: body.sessionNumber,
    })

    return NextResponse.json({
      reply: result.reply,
      llmLatencyMs: result.llmLatencyMs,
      totalLatencyMs: Math.max(0, Date.now() - startedAt),
      ttsStreamUrl: `/api/voice/stream?text=${encodeURIComponent(result.reply)}`,
    })
  } catch {
    return NextResponse.json({ error: 'Realtime orchestration failed' }, { status: 502 })
  }
}
