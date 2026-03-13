import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTransformersEnv = {
  backends: {
    onnx: {} as Record<string, unknown>,
  },
}

const mockGenerate = vi.fn().mockResolvedValue({
  toBlob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/wav' })),
})
const mockFromPretrained = vi.fn().mockResolvedValue({
  generate: mockGenerate,
  voices: {
    af_bella: { language: 'en-us' },
  },
})

vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: mockFromPretrained,
  },
}))

vi.mock('@huggingface/transformers', () => ({
  env: mockTransformersEnv,
}))

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

import { KokoroTTS } from '@/lib/voice-module/providers/tts/KokoroTTS'

describe('KokoroTTS', () => {
  let tts: KokoroTTS

  beforeEach(() => {
    vi.clearAllMocks()
    mockTransformersEnv.backends.onnx = {}
    tts = new KokoroTTS({ voice: 'af_bella', dtype: 'q8' })
  })

  it('implements the TTSProvider interface', () => {
    expect(tts.speak).toBeDefined()
    expect(tts.stop).toBeDefined()
    expect(tts.isSpeaking).toBeDefined()
  })

  it('is not speaking initially', () => {
    expect(tts.isSpeaking()).toBe(false)
  })

  it('lazy-loads the model on first speak', async () => {
    expect(mockFromPretrained).not.toHaveBeenCalled()

    const promise = tts.speak('Hallo')
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(AudioCtor).toHaveBeenCalled()
    })
    AudioCtor.mock.results[0]?.value?.onended?.()
    await promise

    expect(mockFromPretrained).toHaveBeenCalledTimes(1)
    expect(mockFromPretrained).toHaveBeenCalledWith(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      expect.objectContaining({ device: 'wasm' }),
    )
  })

  it('reuses the model on subsequent speaks', async () => {
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>

    const first = tts.speak('Eins')
    await vi.waitFor(() => {
      expect(AudioCtor).toHaveBeenCalledTimes(1)
    })
    AudioCtor.mock.results[0]?.value?.onended?.()
    await first

    const second = tts.speak('Zwei')
    await vi.waitFor(() => {
      expect(AudioCtor).toHaveBeenCalledTimes(2)
    })
    AudioCtor.mock.results[1]?.value?.onended?.()
    await second

    expect(mockFromPretrained).toHaveBeenCalledTimes(1)
  })

  it('calls generate with the configured voice', async () => {
    const promise = tts.speak('Test')
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(AudioCtor).toHaveBeenCalled()
    })
    AudioCtor.mock.results[0]?.value?.onended?.()
    await promise

    expect(mockGenerate).toHaveBeenCalledWith('Test', { voice: 'af_bella' })
  })

  it('notifies about loading state while the model is initialized', async () => {
    const onLoadingChange = vi.fn()
    tts = new KokoroTTS({ voice: 'af_bella', dtype: 'q8', onLoadingChange })

    const promise = tts.speak('Hallo')
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(AudioCtor).toHaveBeenCalled()
    })
    AudioCtor.mock.results[0]?.value?.onended?.()
    await promise

    expect(onLoadingChange).toHaveBeenNthCalledWith(1, true)
    expect(onLoadingChange).toHaveBeenLastCalledWith(false)
  })

  it('configures ONNX runtime logging before loading the model', async () => {
    const promise = tts.speak('Hallo')
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(AudioCtor).toHaveBeenCalled()
    })
    AudioCtor.mock.results[0]?.value?.onended?.()
    await promise

    expect(mockTransformersEnv.backends.onnx.logLevel).toBe('error')
  })

  it('stop cancels current audio', () => {
    tts.stop()
    expect(tts.isSpeaking()).toBe(false)
  })

  it('skips empty text', async () => {
    await tts.speak('')
    expect(mockGenerate).not.toHaveBeenCalled()
  })
})
