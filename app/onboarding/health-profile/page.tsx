'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { FitnessLevel } from '@/lib/types'

const COMPLAINT_OPTIONS = [
  { label: 'Rücken', emoji: '🔙' },
  { label: 'Knie', emoji: '🦵' },
  { label: 'Schulter', emoji: '💪' },
  { label: 'Haltung', emoji: '🧍' },
  { label: 'Hüfte', emoji: '🦴' },
  { label: 'Nacken', emoji: '🦒' },
]

const FITNESS_LEVELS: { value: FitnessLevel; label: string; description: string; emoji: string }[] = [
  { value: 'beginner', label: 'Anfänger', description: 'Wenig Erfahrung, sanfter Einstieg', emoji: '🌱' },
  { value: 'intermediate', label: 'Mittel', description: 'Regelmäßig aktiv, solide Basis', emoji: '⚡' },
  { value: 'advanced', label: 'Fortgeschritten', description: 'Erfahren, bereit für Herausforderungen', emoji: '🔥' },
]

export default function HealthProfilePage() {
  const [complaints, setComplaints] = useState<string[]>([])
  const [goals, setGoals] = useState('')
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('beginner')
  const [sessionDuration, setSessionDuration] = useState(20)
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const toggleComplaint = (label: string) => {
    setComplaints(prev =>
      prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { error } = await supabase.from('health_profiles').upsert({
      user_id: user.id,
      complaints,
      goals,
      fitness_level: fitnessLevel,
      session_duration_minutes: sessionDuration,
      sessions_per_week: sessionsPerWeek,
    }, { onConflict: 'user_id' })

    if (error) {
      console.error('Failed to save health profile:', error)
      setIsLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen px-5 pb-10" style={{ paddingTop: 'max(24px, var(--safe-top))' }}>
      {/* Header */}
      <div className="mb-8 animate-slide-up">
        <div className="text-phase mb-2" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.65rem' }}>DEIN PROFIL</div>
        <h1 className="font-display uppercase" style={{ fontSize: 'clamp(2rem, 10vw, 3.5rem)', lineHeight: 0.95, color: 'var(--foreground)' }}>
          Gesundheits<span style={{ color: 'var(--primary)' }}>profil</span>
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
          Dein Coach braucht diese Infos um deinen Plan zu erstellen.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Complaints */}
        <div>
          <Label className="text-sm font-semibold mb-3 block" style={{ color: 'var(--foreground)' }}>
            Wo hast du Beschwerden?
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>Mehrfachauswahl möglich</span>
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {COMPLAINT_OPTIONS.map(({ label, emoji }) => {
              const selected = complaints.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleComplaint(label)}
                  className={`option-card py-3 px-2 flex flex-col items-center gap-1 ${selected ? 'option-card--selected' : ''}`}
                >
                  <span className="text-xl">{emoji}</span>
                  <span className="text-xs font-medium" style={{ color: selected ? 'var(--primary)' : 'var(--foreground)' }}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Goals */}
        <div className="space-y-2">
          <Label htmlFor="goals" className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            Was ist dein Ziel?
          </Label>
          <Textarea
            id="goals"
            value={goals}
            onChange={e => setGoals(e.target.value)}
            required
            rows={3}
            placeholder="z.B. Rückenschmerzen reduzieren und wieder Sport machen können…"
            className="resize-none"
          />
        </div>

        {/* Fitness level */}
        <div>
          <Label className="text-sm font-semibold mb-3 block" style={{ color: 'var(--foreground)' }}>
            Dein Fitnesslevel
          </Label>
          <div className="space-y-2">
            {FITNESS_LEVELS.map(({ value, label, description, emoji }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFitnessLevel(value)}
                className={`option-card w-full text-left px-4 py-3 flex items-center gap-3 ${fitnessLevel === value ? 'option-card--selected' : ''}`}
              >
                <span className="text-xl">{emoji}</span>
                <div className="flex-1">
                  <div className="font-semibold text-sm" style={{ color: fitnessLevel === value ? 'var(--primary)' : 'var(--foreground)' }}>
                    {label}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{description}</div>
                </div>
                {fitnessLevel === value && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary)' }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#0D0B09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Duration slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Trainingsdauer</Label>
            <span className="font-display text-2xl" style={{ color: 'var(--primary)' }}>{sessionDuration}<span className="text-sm ml-1" style={{ color: 'var(--text-secondary)' }}>min</span></span>
          </div>
          <input
            type="range"
            min={10} max={60} step={5}
            value={sessionDuration}
            onChange={e => setSessionDuration(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((sessionDuration - 10) / 50) * 100}%, var(--border) ${((sessionDuration - 10) / 50) * 100}%, var(--border) 100%)`
            }}
          />
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>10 min</span><span>60 min</span>
          </div>
        </div>

        {/* Frequency slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Einheiten pro Woche</Label>
            <span className="font-display text-2xl" style={{ color: 'var(--primary)' }}>{sessionsPerWeek}<span className="text-sm ml-1" style={{ color: 'var(--text-secondary)' }}>×</span></span>
          </div>
          <input
            type="range"
            min={1} max={7} step={1}
            value={sessionsPerWeek}
            onChange={e => setSessionsPerWeek(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((sessionsPerWeek - 1) / 6) * 100}%, var(--border) ${((sessionsPerWeek - 1) / 6) * 100}%, var(--border) 100%)`
            }}
          />
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>1×</span><span>7×</span>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !goals.trim()}
          className="btn-primary w-full rounded-xl py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Plan wird erstellt…' : 'Trainingsplan erstellen →'}
        </button>
      </form>
    </main>
  )
}
