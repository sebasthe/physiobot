import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElevenLabsTTS } from '@/lib/voice-module/providers/tts/ElevenLabsTTS'

const mockAudioBlob = new Blob(['audio'], { type: 'audio/mpeg' })
const mockSpeak = vi.fn()
const mockResponse = {
  ok: true,
  blob: () => Promise.resolve(mockAudioBlob),
  headers: new Headers(),
}

describe('ElevenLabsTTS', () => {
  let tts: ElevenLabsTTS

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))
    mockSpeak.mockImplementation((utterance: { onend?: () => void }) => {
      utterance.onend?.()
    })
    vi.stubGlobal('speechSynthesis', {
      speak: mockSpeak,
      cancel: vi.fn(),
      speaking: false,
    })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn().mockImplementation((text: string) => ({
      text,
      lang: '',
      rate: 1,
      onend: null as (() => void) | null,
      onerror: null as (() => void) | null,
    })))
    vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      onended: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: '',
    })))
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:url'),
      revokeObjectURL: vi.fn(),
    })

    tts = new ElevenLabsTTS({
      streamEndpoint: '/api/voice/stream',
      fullEndpoint: '/api/voice',
      maxStreamLength: 1200,
    })

    vi.clearAllMocks()
  })

  it('implements TTSProvider interface', () => {
    expect(tts.speak).toBeDefined()
    expect(tts.stop).toBeDefined()
    expect(tts.isSpeaking).toBeDefined()
  })

  it('uses stream endpoint for short text', async () => {
    const promise = tts.speak('Kurzer Text')
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(AudioCtor).toHaveBeenCalled()
    })
    const audioInstance = AudioCtor.mock.results[0]?.value
    audioInstance?.onended?.()

    await promise

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/voice/stream'),
      expect.any(Object),
    )
  })

  it('uses full endpoint for long text', async () => {
    const longText = 'A'.repeat(1201)
    const promise = tts.speak(longText)
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(AudioCtor).toHaveBeenCalled()
    })
    const audioInstance = AudioCtor.mock.results[0]?.value
    audioInstance?.onended?.()

    await promise

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/voice',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('reads API error details and falls back to browser speech synthesis', async () => {
    const onFallback = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({
        error: 'Free users cannot use library voices via the API. Please upgrade your subscription to use this voice.',
        providerCode: 'paid_plan_required',
      }),
    }))

    tts = new ElevenLabsTTS({
      streamEndpoint: '/api/voice/stream',
      fullEndpoint: '/api/voice',
      maxStreamLength: 1200,
      onFallback,
    })

    await tts.speak('Kurzer Text')

    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('paid_plan_required'),
    }))
    expect(globalThis.speechSynthesis.speak).toHaveBeenCalled()
  })

  it('does not cancel browser speech synthesis when fallback is inactive', () => {
    tts.stop()

    expect(globalThis.speechSynthesis.cancel).not.toHaveBeenCalled()
  })
})
