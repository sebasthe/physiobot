import { resolveConsentLevel } from '@/lib/privacy/types'
import { createClient } from '@/lib/supabase/server'
import type { ModeContext } from '@/lib/coach/types'
import type { TranscriptMessage } from '@/lib/mem0'
import type { Language } from '@/lib/types'
import { streamVoiceTurnOrchestration } from '@/lib/voice/server-orchestrator'
import type { ToolDefinition, WorkoutState } from '@/lib/voice-module/core/types'

function sseData(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(sseData({ type: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  }

  const body = await request.json() as {
    messages?: TranscriptMessage[]
    currentExercise?: { name?: string; description?: string; phase?: string }
    sessionNumber?: number
    exercisePhase?: ModeContext['exercisePhase']
    exerciseStatus?: ModeContext['exerciseStatus']
    tools?: ToolDefinition[]
    workoutState?: WorkoutState
    language?: Language
    planId?: string | null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('privacy_consent')
    .eq('id', user.id)
    .maybeSingle()

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      void (async () => {
        try {
          for await (const chunk of streamVoiceTurnOrchestration(supabase, {
            userId: user.id,
            messages: body.messages,
            currentExercise: body.currentExercise,
            sessionNumber: body.sessionNumber,
            exercisePhase: body.exercisePhase,
            exerciseStatus: body.exerciseStatus,
            tools: body.tools,
            workoutState: body.workoutState,
            language: body.language,
            consent: resolveConsentLevel(profile?.privacy_consent),
            planId: typeof body.planId === 'string' ? body.planId : null,
          })) {
            if (chunk.type === 'delta') {
              controller.enqueue(encoder.encode(sseData({ type: 'delta', text: chunk.text })))
              continue
            }
            if (chunk.type === 'tool_call') {
              controller.enqueue(encoder.encode(sseData({
                type: 'tool_call',
                name: chunk.name,
                input: chunk.input,
              })))
              continue
            }
            controller.enqueue(encoder.encode(sseData({
              type: 'done',
              reply: chunk.reply,
              llmLatencyMs: chunk.llmLatencyMs,
              totalLatencyMs: Math.max(0, Date.now() - startedAt),
            })))
          }
          controller.close()
        } catch {
          controller.enqueue(encoder.encode(sseData({
            type: 'error',
            message: 'Realtime orchestration failed',
          })))
          controller.close()
        }
      })()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
