import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import PlanOverview from '@/components/training/PlanOverview'
import type { Exercise } from '@/lib/types'

const exercises: Exercise[] = [
  { name: 'Katzenbuckel', description: 'Rücken mobilisieren', phase: 'warmup',
    duration_seconds: 30, voice_script: "Los geht's!" },
  { name: 'Brücke', description: 'Gesäß heben', phase: 'main',
    repetitions: 10, sets: 3, voice_script: 'Halte die Spannung!' },
]

describe('PlanOverview', () => {
  it('shows warmup and main exercises', () => {
    render(<PlanOverview exercises={exercises} onStartTraining={() => {}} />)
    expect(screen.getByText('Katzenbuckel')).toBeInTheDocument()
    expect(screen.getByText('Brücke')).toBeInTheDocument()
  })

  it('shows start button', () => {
    render(<PlanOverview exercises={exercises} onStartTraining={() => {}} />)
    expect(screen.getByRole('button', { name: /training starten/i })).toBeInTheDocument()
  })
})
