import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readElevenLabsError, toElevenLabsErrorPayload } from '@/lib/voice/elevenlabs'

const MAX_TEXT_LENGTH = 2000

export async function POST(request: Request) {
  let user
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    return NextResponse.json({ error: 'Auth error' }, { status: 500 })
  }

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let text: unknown
  try {
    const body = await request.json()
    text = body?.text
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof text !== 'string' || text.trim() === '') {
    return NextResponse.json({ error: 'text must be a non-empty string' }, { status: 400 })
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `text must be at most ${MAX_TEXT_LENGTH} characters` }, { status: 400 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB'

  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 })
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  )

  if (!response.ok) {
    const upstreamError = await readElevenLabsError(response, 'ElevenLabs error')
    console.error('ElevenLabs error', upstreamError)
    return NextResponse.json(toElevenLabsErrorPayload(upstreamError), { status: upstreamError.status })
  }

  const audio = await response.arrayBuffer()
  return new NextResponse(audio, {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}
