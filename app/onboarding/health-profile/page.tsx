'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import { useI18n } from '@/components/i18n/I18nProvider'
import { createClient } from '@/lib/supabase/client'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { FitnessLevel } from '@/lib/types'

export default function HealthProfilePage() {
  const [complaints, setComplaints] = useState<string[]>([])
  const [goals, setGoals] = useState('')
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('beginner')
  const [sessionDuration, setSessionDuration] = useState(20)
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3)
  const [isLoading, setIsLoading] = useState(false)
  const { messages } = useI18n()
  const router = useRouter()
  const complaintOptions = [
    { label: messages.onboarding.health.complaintsOptions.back, emoji: '🔙' },
    { label: messages.onboarding.health.complaintsOptions.knee, emoji: '🦵' },
    { label: messages.onboarding.health.complaintsOptions.shoulder, emoji: '💪' },
    { label: messages.onboarding.health.complaintsOptions.posture, emoji: '🧍' },
    { label: messages.onboarding.health.complaintsOptions.hip, emoji: '🦴' },
    { label: messages.onboarding.health.complaintsOptions.neck, emoji: '🦒' },
  ]
  const fitnessLevels: { value: FitnessLevel; label: string; description: string; emoji: string }[] = [
    { value: 'beginner', label: messages.onboarding.health.fitnessOptions.beginner.label, description: messages.onboarding.health.fitnessOptions.beginner.description, emoji: '🌱' },
    { value: 'intermediate', label: messages.onboarding.health.fitnessOptions.intermediate.label, description: messages.onboarding.health.fitnessOptions.intermediate.description, emoji: '⚡' },
    { value: 'advanced', label: messages.onboarding.health.fitnessOptions.advanced.label, description: messages.onboarding.health.fitnessOptions.advanced.description, emoji: '🔥' },
  ]

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
    <main className="vital-gradient mx-auto min-h-screen max-w-xl px-5 pb-10 md:max-w-4xl md:px-6 lg:max-w-5xl lg:px-8" style={{ paddingTop: 'max(24px, var(--safe-top))' }}>
      <div className="mb-6 flex justify-end">
        <LanguageToggle />
      </div>

      {/* Header */}
      <div className="mb-8 animate-slide-up md:max-w-2xl">
        <div className="text-phase mb-2" style={{ color: 'var(--primary)', letterSpacing: '0.2em', fontSize: '0.65rem' }}>{messages.onboarding.health.eyebrow.toUpperCase()}</div>
        <h1 className="font-display uppercase" style={{ fontSize: 'clamp(2rem, 10vw, 3.5rem)', lineHeight: 0.95, color: 'var(--foreground)' }}>
          {messages.onboarding.health.title}
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
          {messages.onboarding.health.copy}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 md:grid md:grid-cols-2 md:gap-8 md:space-y-0">
        {/* Complaints */}
        <div className="md:col-span-2">
          <Label className="text-sm font-semibold mb-3 block" style={{ color: 'var(--foreground)' }}>
            {messages.onboarding.health.complaints}
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{messages.onboarding.health.multipleChoice}</span>
          </Label>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {complaintOptions.map(({ label, emoji }) => {
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
            {messages.onboarding.health.goals}
          </Label>
          <Textarea
            id="goals"
            value={goals}
            onChange={e => setGoals(e.target.value)}
            required
            rows={3}
            placeholder={messages.onboarding.health.goalsPlaceholder}
            className="resize-none"
          />
        </div>

        {/* Fitness level */}
        <div>
          <Label className="text-sm font-semibold mb-3 block" style={{ color: 'var(--foreground)' }}>
            {messages.onboarding.health.fitnessLevel}
          </Label>
          <div className="space-y-2">
            {fitnessLevels.map(({ value, label, description, emoji }) => (
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
            <Label className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{messages.onboarding.health.duration}</Label>
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
            <Label className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{messages.onboarding.health.sessionsPerWeek}</Label>
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
          className="btn-primary w-full rounded-xl py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed md:col-span-2"
        >
          {isLoading ? messages.onboarding.health.creatingPlan : messages.onboarding.health.createPlan}
        </button>
      </form>
    </main>
  )
}
