import type { VoiceProvider } from './types'
import { BrowserTTSProvider } from './browser-tts'
import { ElevenLabsProvider } from './elevenlabs'

export function createVoiceProvider(): VoiceProvider {
  const provider = process.env.NEXT_PUBLIC_VOICE_PROVIDER ?? 'browser'
  if (provider === 'elevenlabs') {
    return new ElevenLabsProvider()
  }
  return new BrowserTTSProvider()
}

export type { VoiceProvider }
