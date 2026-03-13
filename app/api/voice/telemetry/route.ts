import { NextResponse } from 'next/server'
import { classifyTelemetryEvent } from '@/lib/privacy/classifier'
import { shouldRedactLog } from '@/lib/privacy/hooks'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_EVENT_TYPES = new Set([
  'listen_started',
  'transcript_committed',
  'agent_reply_received',
  'audio_started',
  'interrupt',
  'fallback_mode',
  'turn_metrics',
  'voice_error',
])

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    eventType?: string
    sessionId?: string
    payload?: Record<string, unknown>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.eventType || !ALLOWED_EVENT_TYPES.has(body.eventType)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
  }

  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
  const sessionId = typeof body.sessionId === 'string' && body.sessionId.length > 0 ? body.sessionId : null
  const dataClass = classifyTelemetryEvent(body.eventType)
  const redactedEvent = shouldRedactLog({
    event_type: body.eventType,
    payload,
  }, dataClass)

  const { error } = await supabase.from('voice_telemetry_events').insert({
    user_id: user.id,
    session_id: sessionId,
    event_type: redactedEvent.event_type,
    payload: redactedEvent.payload,
    data_class: dataClass,
  })

  if (error) {
    return NextResponse.json({ error: 'Telemetry insert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
