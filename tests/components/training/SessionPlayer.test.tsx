import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import SessionPlayer from '@/components/training/SessionPlayer'
import type { Exercise } from '@/lib/types'
import { clearVoiceDebugEvents, getVoiceDebugEvents, setVoiceDebugEnabled } from '@/lib/voice-debug/client'

const exercises: Exercise[] = [
  { name: 'Katzenbuckel', description: 'Rücken mobilisieren', phase: 'warmup',
    duration_seconds: 30, voice_script: 'Mobilisiere jetzt deinen Rücken!' },
  { name: 'Brücke', description: 'Gesäß heben', phase: 'main',
    repetitions: 10, sets: 3, voice_script: 'Hebe das Gesäß!' },
]

let mockSpeak: ReturnType<typeof vi.fn>
let mockCancel: ReturnType<typeof vi.fn>
let mockResume: ReturnType<typeof vi.fn>
let mockGetVoices: ReturnType<typeof vi.fn>
let mockFetch: ReturnType<typeof vi.fn>
const originalCoachLanguage = process.env.NEXT_PUBLIC_COACH_LANGUAGE
const originalVoiceProvider = process.env.NEXT_PUBLIC_VOICE_PROVIDER
const originalKokoroDevice = process.env.NEXT_PUBLIC_KOKORO_DEVICE

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = []

  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: { results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()

  constructor() {
    MockSpeechRecognition.instances.push(this)
  }

  static reset() {
    MockSpeechRecognition.instances = []
  }
}

vi.stubGlobal('webkitSpeechRecognition', MockSpeechRecognition)

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider initialLocale="de">{node}</I18nProvider>)
}

describe('SessionPlayer', () => {
  beforeEach(() => {
    if (originalCoachLanguage === undefined) {
      delete process.env.NEXT_PUBLIC_COACH_LANGUAGE
    } else {
      process.env.NEXT_PUBLIC_COACH_LANGUAGE = originalCoachLanguage
    }

    window.localStorage.clear()
    clearVoiceDebugEvents()
    delete (window as Window & {
      __PHYSIOBOT_VOICE_DEBUG__?: boolean | { enabled?: boolean }
      __PHYSIOBOT_VOICE_DEBUG_STORE__?: unknown
    }).__PHYSIOBOT_VOICE_DEBUG__
    delete (window as Window & {
      __PHYSIOBOT_VOICE_DEBUG__?: boolean | { enabled?: boolean }
      __PHYSIOBOT_VOICE_DEBUG_STORE__?: unknown
    }).__PHYSIOBOT_VOICE_DEBUG_STORE__

    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: false },
    })

    mockSpeak = vi.fn((utterance: { onend?: () => void }) => {
      utterance.onend?.()
    })
    mockCancel = vi.fn()
    mockResume = vi.fn()
    mockGetVoices = vi.fn().mockReturnValue([])
    MockSpeechRecognition.reset()
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reply: 'Keep your shoulders soft and move with control.',
        llmLatencyMs: 42,
      }),
    })

    vi.stubGlobal('speechSynthesis', {
      speak: mockSpeak,
      cancel: mockCancel,
      resume: mockResume,
      getVoices: mockGetVoices,
      speaking: false,
      pending: false,
      paused: false,
    })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn().mockImplementation((text: string) => ({
      text,
      lang: '',
      rate: 1,
      volume: 1,
      voice: null,
      onend: null as (() => void) | null,
      onerror: null as (() => void) | null,
    })))
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalVoiceProvider === undefined) {
      delete process.env.NEXT_PUBLIC_VOICE_PROVIDER
    } else {
      process.env.NEXT_PUBLIC_VOICE_PROVIDER = originalVoiceProvider
    }

    if (originalKokoroDevice === undefined) {
      delete process.env.NEXT_PUBLIC_KOKORO_DEVICE
    } else {
      process.env.NEXT_PUBLIC_KOKORO_DEVICE = originalKokoroDevice
    }

    if (originalCoachLanguage === undefined) {
      delete process.env.NEXT_PUBLIC_COACH_LANGUAGE
    } else {
      process.env.NEXT_PUBLIC_COACH_LANGUAGE = originalCoachLanguage
    }
  })

  it('shows first exercise name', async () => {
    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    expect(await screen.findByText('Katzenbuckel')).toBeInTheDocument()
  })

  it('shows next exercise on next button click', async () => {
    const user = userEvent.setup()
    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /weiter/i }))
    expect(screen.getByText('Brücke')).toBeInTheDocument()
  })

  it('calls onComplete after last exercise', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={onComplete} />)
    await user.click(screen.getByRole('button', { name: /weiter/i }))
    await user.click(screen.getByRole('button', { name: /abschließen/i }))
    expect(onComplete).toHaveBeenCalled()
  })

  it('renders empty state when exercises array is empty', () => {
    renderWithI18n(<SessionPlayer exercises={[]} onComplete={vi.fn()} />)
    expect(screen.getByText(/keine übungen/i)).toBeInTheDocument()
  })

  it('shows an unlock hint before the first audio interaction', async () => {
    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    expect(await screen.findByText(/audio startet nach deiner ersten interaktion/i)).toBeInTheDocument()
    expect(globalThis.speechSynthesis.speak).not.toHaveBeenCalled()
  })

  it('speaks after pressing Nochmal when audio starts locked', async () => {
    const user = userEvent.setup()
    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /nochmal/i }))

    await vi.waitFor(() => {
      expect(globalThis.speechSynthesis.speak).toHaveBeenCalled()
    })
  })

  it('warms up browser TTS immediately on repeat before the coach cue request resolves', async () => {
    const user = userEvent.setup()
    let resolveFetch: ((value: unknown) => void) | undefined
    mockFetch.mockImplementation(() => new Promise(resolve => {
      resolveFetch = resolve
    }))

    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /nochmal/i }))

    await vi.waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledTimes(1)
    })

    expect(globalThis.SpeechSynthesisUtterance).toHaveBeenNthCalledWith(1, '.')

    await act(async () => {
      resolveFetch?.({
        ok: true,
        status: 200,
        json: async () => ({
          reply: 'Keep your shoulders soft and move with control.',
          llmLatencyMs: 42,
        }),
      })
    })

    await vi.waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledTimes(2)
    })
  })

  it('calls speech synthesis with a dynamic coach cue when audio is already unlocked', async () => {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: true },
    })

    await act(async () => {
      renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    })

    await vi.waitFor(() => {
      expect(globalThis.speechSynthesis.speak).toHaveBeenCalled()
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/voice/session', expect.objectContaining({
      method: 'POST',
    }))
    expect(globalThis.SpeechSynthesisUtterance).toHaveBeenCalledWith('Keep your shoulders soft and move with control.')
  })

  it('uses the configured English speech locale for browser TTS', async () => {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: true },
    })

    await act(async () => {
      renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} coachLanguage="en" />)
    })

    await vi.waitFor(() => {
      expect(mockSpeak).toHaveBeenCalled()
    })

    const utterance = mockSpeak.mock.calls[0]?.[0]
    expect(utterance?.lang).toBe('en-US')
  })

  it('sends the requested English language to the adaptive cue endpoint and shows the English cue', async () => {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: true },
    })

    await act(async () => {
      renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} coachLanguage="en" />)
    })

    expect(await screen.findByText(/keep your shoulders soft/i)).toBeInTheDocument()

    const [, request] = mockFetch.mock.calls[0] ?? []
    expect(JSON.parse(String(request?.body))).toEqual(expect.objectContaining({
      language: 'en',
    }))
  })

  it('prefetches the intro cue only once while the timed exercise timer ticks', async () => {
    vi.useFakeTimers()

    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    expect(mockFetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100)
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('keeps browser speech recognition active after the mic is enabled', async () => {
    vi.useFakeTimers()

    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /mikrofon an/i }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    const recognition = MockSpeechRecognition.instances[0]
    expect(recognition?.start).toHaveBeenCalledTimes(1)
    expect(recognition?.abort).not.toHaveBeenCalled()
  })

  it('keeps the voice glow active while the mic loop is armed', () => {
    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    expect(screen.getByTestId('timer-ring-fallback')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /mikrofon an/i }))

    expect(screen.getByTestId('voice-glow-frame')).toBeInTheDocument()
    expect(screen.getByText('Hoert zu')).toBeInTheDocument()
  })

  it('shows a hint when intro playback fails', async () => {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: true },
    })

    mockSpeak.mockImplementation((utterance: { onerror?: () => void }) => {
      setTimeout(() => utterance.onerror?.(), 0)
    })

    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    expect(await screen.findByText(/tippe oder druecke nochmal/i)).toBeInTheDocument()
  })

  it('records events when voice debug is enabled', async () => {
    setVoiceDebugEnabled(true)

    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    await vi.waitFor(() => {
      expect(getVoiceDebugEvents().some(event => event.type === 'session-player.init')).toBe(true)
    })
  })

  it('falls back to the stored voice script when the adaptive cue request fails', async () => {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: true },
    })

    mockFetch.mockRejectedValue(new Error('network down'))

    await act(async () => {
      renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    })

    await vi.waitFor(() => {
      expect(globalThis.speechSynthesis.speak).toHaveBeenCalled()
    })

    expect(globalThis.SpeechSynthesisUtterance).toHaveBeenCalledWith('Mobilisiere jetzt deinen Rücken!')
  })

  it('does not fall back to the stored German voice script when English is forced', async () => {
    process.env.NEXT_PUBLIC_COACH_LANGUAGE = 'en'
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    expect(await screen.findByText(/let's begin this exercise/i)).toBeInTheDocument()
    expect(screen.queryByText(/mobilisiere jetzt deinen rücken/i)).not.toBeInTheDocument()
  })

  it('prefers the stable wasm Kokoro path unless webgpu is explicitly requested', async () => {
    vi.useFakeTimers()
    process.env.NEXT_PUBLIC_VOICE_PROVIDER = 'kokoro'

    const { KokoroTTS } = await import('@/lib/voice-module/providers/tts/KokoroTTS')
    const kokoroSpy = vi.spyOn(KokoroTTS.prototype, 'prepare').mockResolvedValue()

    renderWithI18n(<SessionPlayer exercises={exercises} onComplete={vi.fn()} coachLanguage="en" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })

    expect(kokoroSpy).toHaveBeenCalled()

    const instance = kokoroSpy.mock.instances[0] as {
      config?: { device?: string }
    }
    expect(instance['config']?.device).toBe('wasm')

    kokoroSpy.mockRestore()
  })
})
