import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_TEXT_LENGTH = 1200

function readTextFromUrl(request: Request) {
  const { searchParams } = new URL(request.url)
  return searchParams.get('text') ?? ''
}

async function validateAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(request: Request) {
  const user = await validateAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const text = readTextFromUrl(request).trim()
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `text must be <= ${MAX_TEXT_LENGTH}` }, { status: 400 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB'
  if (!apiKey) return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 })

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128&optimize_streaming_latency=3`,
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

  if (!response.ok || !response.body) {
    return NextResponse.json({ error: 'ElevenLabs stream error' }, { status: 502 })
  }

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
