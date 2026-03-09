import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function fetchElevenLabsToken(type: 'realtime_scribe' | 'tts_websocket', apiKey: string) {
  const response = await fetch(`https://api.elevenlabs.io/v1/single-use-token/${type}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(`Token endpoint failed for ${type}`)
  }

  const data = await response.json() as { token?: string }
  if (!data.token) {
    throw new Error(`No token returned for ${type}`)
  }
  return data.token
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 })
  }

  try {
    const [sttToken, ttsToken] = await Promise.all([
      fetchElevenLabsToken('realtime_scribe', apiKey),
      fetchElevenLabsToken('tts_websocket', apiKey),
    ])

    return NextResponse.json({ sttToken, ttsToken })
  } catch {
    return NextResponse.json({ error: 'Token generation failed' }, { status: 502 })
  }
}
