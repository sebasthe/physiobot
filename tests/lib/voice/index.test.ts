import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock environment before importing
describe('createVoiceProvider', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns BrowserTTSProvider when VOICE_PROVIDER is browser', async () => {
    vi.stubEnv('NEXT_PUBLIC_VOICE_PROVIDER', 'browser')
    const { createVoiceProvider } = await import('@/lib/voice/index')
    const { BrowserTTSProvider } = await import('@/lib/voice/browser-tts')
    expect(createVoiceProvider()).toBeInstanceOf(BrowserTTSProvider)
  })

  it('returns ElevenLabsProvider when VOICE_PROVIDER is elevenlabs', async () => {
    vi.stubEnv('NEXT_PUBLIC_VOICE_PROVIDER', 'elevenlabs')
    const { createVoiceProvider } = await import('@/lib/voice/index')
    const { ElevenLabsProvider } = await import('@/lib/voice/elevenlabs')
    expect(createVoiceProvider()).toBeInstanceOf(ElevenLabsProvider)
  })

  it('defaults to BrowserTTSProvider when env var not set', async () => {
    vi.unstubAllEnvs()
    const { createVoiceProvider } = await import('@/lib/voice/index')
    const { BrowserTTSProvider } = await import('@/lib/voice/browser-tts')
    expect(createVoiceProvider()).toBeInstanceOf(BrowserTTSProvider)
  })
})
