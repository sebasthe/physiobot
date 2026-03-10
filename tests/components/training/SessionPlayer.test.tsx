import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SessionPlayer from '@/components/training/SessionPlayer'
import type { Exercise } from '@/lib/types'

const exercises: Exercise[] = [
  { name: 'Katzenbuckel', description: 'Rücken mobilisieren', phase: 'warmup',
    duration_seconds: 30, voice_script: 'Mobilisiere jetzt deinen Rücken!' },
  { name: 'Brücke', description: 'Gesäß heben', phase: 'main',
    repetitions: 10, sets: 3, voice_script: 'Hebe das Gesäß!' },
]

describe('SessionPlayer', () => {
  beforeEach(() => {
    const mockSpeak = vi.fn((utterance: { onend?: () => void }) => {
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
  })

  it('shows first exercise name', () => {
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    expect(screen.getByText('Katzenbuckel')).toBeInTheDocument()
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

  it('calls speech synthesis with the first voice script on mount', () => {
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} />)
    expect(globalThis.speechSynthesis.speak).toHaveBeenCalled()
  })
})
