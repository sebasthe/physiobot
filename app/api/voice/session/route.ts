import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ModeContext } from '@/lib/coach/types'
import type { TranscriptMessage } from '@/lib/mem0'
import { runVoiceTurnOrchestration } from '@/lib/voice/server-orchestrator'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    messages?: TranscriptMessage[]
    currentExercise?: { name?: string; description?: string; phase?: string }
    sessionNumber?: number
    exercisePhase?: ModeContext['exercisePhase']
    exerciseStatus?: ModeContext['exerciseStatus']
  }

  try {
    const result = await runVoiceTurnOrchestration(supabase, {
      userId: user.id,
      messages: body.messages,
      currentExercise: body.currentExercise,
      sessionNumber: body.sessionNumber,
      exercisePhase: body.exercisePhase,
      exerciseStatus: body.exerciseStatus,
    })

    return NextResponse.json({
      reply: result.reply,
      llmLatencyMs: result.llmLatencyMs,
    })
  } catch {
    return NextResponse.json({ error: 'Voice orchestration failed' }, { status: 502 })
  }
}
