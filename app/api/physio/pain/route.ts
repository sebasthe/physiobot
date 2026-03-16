import { NextResponse } from 'next/server'
import { logPrivacyAuditEvent } from '@/lib/privacy/audit'
import { DataClass } from '@/lib/privacy/types'
import { parsePainReport, shouldAbortSession } from '@/lib/physio/pain-tracker'
import { createClient } from '@/lib/supabase/server'

interface PainRouteBody {
  location?: string
  intensity?: number
  type?: string
  exerciseId?: string
  sessionId?: string | null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as PainRouteBody | null
  if (
    !body
    || typeof body.location !== 'string'
    || typeof body.intensity !== 'number'
    || typeof body.type !== 'string'
    || typeof body.exerciseId !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid pain report' }, { status: 400 })
  }

  const entry = parsePainReport({
    location: body.location,
    intensity: body.intensity,
    type: body.type,
  }, body.exerciseId)
  const shouldAbort = shouldAbortSession(entry)

  const { error } = await supabase.from('pain_log').insert({
    user_id: user.id,
    session_id: typeof body.sessionId === 'string' ? body.sessionId : null,
    exercise_id: entry.exerciseId,
    location: entry.location,
    intensity: entry.intensity,
    type: entry.type,
    data_class: DataClass.MedicalRehab,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logPrivacyAuditEvent({
    supabase,
    userId: user.id,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
    eventType: 'class_d_write',
    dataClass: DataClass.MedicalRehab,
    payload: {
      table: 'pain_log',
      action: 'insert',
      data_class: DataClass.MedicalRehab,
    },
  }).catch(() => undefined)

  return NextResponse.json({
    stored: true,
    shouldAbort,
  })
}
