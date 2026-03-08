import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateGamification } from '@/lib/gamification'
import type { Exercise } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const exercises: Exercise[] = body.exercises ?? []
  const sessionId: string | undefined = body.sessionId

  const result = await updateGamification(supabase, user.id, exercises, sessionId)
  return NextResponse.json(result)
}
