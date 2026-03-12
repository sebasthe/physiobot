import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SessionPlayer from '@/components/training/SessionPlayer'
import type { Exercise } from '@/lib/types'
import { clearVoiceDebugEvents, getVoiceDebugEvents } from '@/lib/voice-debug/client'

const exercises: Exercise[] = [
  { name: 'Katzenbuckel', description: 'Rücken mobilisieren', phase: 'warmup',
    duration_seconds: 30, voice_script: 'Mobilisiere jetzt deinen Rücken!' },
  { name: 'Brücke', description: 'Gesäß heben', phase: 'main',
    repetitions: 10, sets: 3, voice_script: 'Hebe das Gesäß!' },
]

let mockSpeak: ReturnType<typeof vi.fn>
let mockCancel: ReturnType<typeof vi.fn>

describe('SessionPlayer', () => {
  beforeEach(() => {
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

    vi.stubGlobal('speechSynthesis', {
      speak: mockSpeak,
      cancel: mockCancel,
      speaking: false,
    })
    vi.stubGlobal('SpeechSynthesisUtterance', vi.fn().mockImplementation((text: string) => ({
      text,
      lang: '',
      rate: 1,
      onend: null as (() => void) | null,
      onerror: null as (() => void) | null,
    })))
  })

  it('shows first exercise name', async () => {
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    expect(await screen.findByText('Katzenbuckel')).toBeInTheDocument()
  })

  it('shows next exercise on next button click', async () => {
    const user = userEvent.setup()
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /weiter/i }))
    expect(screen.getByText('Brücke')).toBeInTheDocument()
  })

  it('calls onComplete after last exercise', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<SessionPlayer exercises={exercises} onComplete={onComplete} />)
    await user.click(screen.getByRole('button', { name: /weiter/i }))
    await user.click(screen.getByRole('button', { name: /abschließen/i }))
    expect(onComplete).toHaveBeenCalled()
  })

  it('renders empty state when exercises array is empty', () => {
    render(<SessionPlayer exercises={[]} onComplete={vi.fn()} />)
    expect(screen.getByText(/keine uebungen/i)).toBeInTheDocument()
  })

  it('shows an unlock hint before the first audio interaction', async () => {
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    expect(await screen.findByText(/audio braucht die erste interaktion/i)).toBeInTheDocument()
    expect(globalThis.speechSynthesis.speak).not.toHaveBeenCalled()
  })

  it('speaks after pressing Nochmal when audio starts locked', async () => {
    const user = userEvent.setup()
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /nochmal/i }))

    await vi.waitFor(() => {
      expect(globalThis.speechSynthesis.speak).toHaveBeenCalled()
    })
  })

  it('calls speech synthesis with the first voice script when audio is already unlocked', async () => {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: true },
    })

    await act(async () => {
      render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    })

    await vi.waitFor(() => {
      expect(globalThis.speechSynthesis.speak).toHaveBeenCalled()
    })
  })

  it('shows a hint when intro playback fails', async () => {
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: true },
    })

    mockSpeak.mockImplementation((utterance: { onerror?: () => void }) => {
      setTimeout(() => utterance.onerror?.(), 0)
    })

    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    expect(await screen.findByText(/tippe oder druecke nochmal/i)).toBeInTheDocument()
  })

  it('renders the debug panel and records events when voice debug is enabled', async () => {
    window.localStorage.setItem('physiobot:voice-debug', '1')

    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)

    expect(await screen.findByTestId('voice-debug-panel')).toBeInTheDocument()
    expect(getVoiceDebugEvents().some(event => event.type === 'session-player.init')).toBe(true)
  })
})
