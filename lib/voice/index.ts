import { BrowserTTSProvider } from './browser-tts'
import { ElevenLabsProvider } from './elevenlabs'
import type { VoiceProvider } from './types'

export function createVoiceProvider(): VoiceProvider {
  const provider = process.env.NEXT_PUBLIC_VOICE_PROVIDER ?? 'browser'
  if (provider === 'elevenlabs') {
    return new ElevenLabsProvider()
  }
  if (provider !== 'browser' && provider !== '') {
    console.warn(`Unknown NEXT_PUBLIC_VOICE_PROVIDER: "${provider}", falling back to browser TTS`)
  }
  return new BrowserTTSProvider()
}

export type { VoiceProvider }
