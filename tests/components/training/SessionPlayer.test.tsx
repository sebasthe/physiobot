import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import SessionPlayer from '@/components/training/SessionPlayer'
import type { Exercise } from '@/lib/types'

const exercises: Exercise[] = [
  { name: 'Katzenbuckel', description: 'Rücken mobilisieren', phase: 'warmup',
    duration_seconds: 30, voice_script: 'Mobilisiere jetzt deinen Rücken!' },
  { name: 'Brücke', description: 'Gesäß heben', phase: 'main',
    repetitions: 10, sets: 3, voice_script: 'Hebe das Gesäß!' },
]

describe('SessionPlayer', () => {
  it('shows first exercise name', () => {
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} speak={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByText('Katzenbuckel')).toBeInTheDocument()
  })

  it('shows next exercise on next button click', async () => {
    const user = userEvent.setup()
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} speak={vi.fn().mockResolvedValue(undefined)} />)
    await user.click(screen.getByRole('button', { name: /weiter/i }))
    expect(screen.getByText('Brücke')).toBeInTheDocument()
  })

  it('calls onComplete after last exercise', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<SessionPlayer exercises={exercises} onComplete={onComplete} speak={vi.fn().mockResolvedValue(undefined)} />)
    await user.click(screen.getByRole('button', { name: /weiter/i }))
    await user.click(screen.getByRole('button', { name: /abschließen/i }))
    expect(onComplete).toHaveBeenCalled()
  })

  it('renders empty state when exercises array is empty', () => {
    render(<SessionPlayer exercises={[]} onComplete={vi.fn()} speak={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByText(/keine übungen/i)).toBeInTheDocument()
  })

  it('calls speak with the voice_script of the first exercise on mount', () => {
    const speak = vi.fn().mockResolvedValue(undefined)
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} speak={speak} />)
    expect(speak).toHaveBeenCalledWith('Mobilisiere jetzt deinen Rücken!')
  })
})
