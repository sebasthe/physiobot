'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PlanOverview from '@/components/training/PlanOverview'
import type { Exercise } from '@/lib/types'

interface Props {
  hasActivePlan: boolean
  initialExercises: Exercise[]
}

export default function DashboardClient({ hasActivePlan, initialExercises }: Props) {
  const [isGenerating, setIsGenerating] = useState(!hasActivePlan)
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises)
  const [error, setError] = useState<string>()
  const router = useRouter()

  useEffect(() => {
    if (!hasActivePlan) generatePlan()
  }, [])

  const generatePlan = async () => {
    setIsGenerating(true)
    setError(undefined)
    try {
      const res = await fetch('/api/generate-plan', { method: 'POST' })
      if (!res.ok) throw new Error('Plan generation failed')
      const plan = await res.json()
      setExercises(plan.exercises as Exercise[])
    } catch {
      setError('Plan konnte nicht erstellt werden. Bitte erneut versuchen.')
    }
    setIsGenerating(false)
  }

  if (isGenerating) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center animate-pulse-glow"
            style={{ background: 'rgba(240,160,75,0.1)', border: '2px solid var(--primary)' }}>
            <span className="text-2xl">🧠</span>
          </div>
          <div className="font-display text-2xl uppercase" style={{ color: 'var(--foreground)' }}>
            Plan wird erstellt
          </div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Claude analysiert dein Profil…
          </div>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4">
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          <button onClick={generatePlan} className="btn-primary rounded-xl px-6 py-3">
            Erneut versuchen
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="px-5 pb-10" style={{ paddingTop: 'max(24px, var(--safe-top))' }}>
      <div className="mb-6 animate-slide-up">
        <div className="text-phase mb-1" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.65rem' }}>HEUTE</div>
        <h1 className="font-display uppercase" style={{ fontSize: 'clamp(2rem, 10vw, 3.2rem)', lineHeight: 0.95 }}>
          Dein <span style={{ color: 'var(--primary)' }}>Plan</span>
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {exercises.length} Übungen · {exercises.filter(e => e.phase === 'warmup').length} Aufwärmen · {exercises.filter(e => e.phase === 'main').length} Haupt · {exercises.filter(e => e.phase === 'cooldown').length} Cooldown
        </p>
      </div>
      <PlanOverview
        exercises={exercises}
        onStartTraining={() => router.push('/training/session')}
      />
    </main>
  )
}
