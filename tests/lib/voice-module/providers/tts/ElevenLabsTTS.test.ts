import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElevenLabsTTS } from '@/lib/voice-module/providers/tts/ElevenLabsTTS'

const mockAudioBlob = new Blob(['audio'], { type: 'audio/mpeg' })
const mockResponse = {
  ok: true,
  blob: () => Promise.resolve(mockAudioBlob),
}

describe('ElevenLabsTTS', () => {
  let tts: ElevenLabsTTS

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))
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
})
