import { NextResponse } from 'next/server'
import { resolveConsentLevel } from '@/lib/privacy/types'
import { createClient } from '@/lib/supabase/server'
import type { ModeContext } from '@/lib/coach/types'
import type { TranscriptMessage } from '@/lib/mem0'
import type { Language } from '@/lib/types'
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
    language?: Language
    planId?: string | null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('privacy_consent')
    .eq('id', user.id)
    .maybeSingle()

  try {
    const result = await runVoiceTurnOrchestration(supabase, {
      userId: user.id,
      messages: body.messages,
      currentExercise: body.currentExercise,
      sessionNumber: body.sessionNumber,
      exercisePhase: body.exercisePhase,
      exerciseStatus: body.exerciseStatus,
      language: body.language,
      consent: resolveConsentLevel(profile?.privacy_consent),
      planId: typeof body.planId === 'string' ? body.planId : null,
    })

    return NextResponse.json({
      reply: result.reply,
      llmLatencyMs: result.llmLatencyMs,
    })
  } catch (error) {
    console.error('Voice session orchestration failed', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Voice orchestration failed',
    }, { status: 502 })
  }
}
