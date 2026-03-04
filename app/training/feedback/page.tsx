'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SessionFeedback } from '@/lib/types'

const DIFFICULTY_OPTIONS = [
  { value: 'too_easy',  emoji: '🌟', label: 'Zu leicht', color: '#63B2FF', bg: 'rgba(99,178,255,0.12)' },
  { value: 'right',     emoji: '✅', label: 'Passt',     color: '#4CAF82', bg: 'rgba(76,175,130,0.12)' },
  { value: 'too_hard',  emoji: '🔥', label: 'Zu hart',   color: '#F0A04B', bg: 'rgba(240,160,75,0.12)' },
  { value: 'painful',   emoji: '⚠️', label: 'Schmerz',   color: '#E85D5D', bg: 'rgba(232,93,93,0.12)' },
] as const

function FeedbackForm() {
  const [feedbacks, setFeedbacks] = useState<SessionFeedback[]>([])
  const [exercises, setExercises] = useState<{ name: string; index: number }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  useEffect(() => {
    loadExercises()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadExercises = async () => {
    const supabase = createClient()

    // If no sessionId, load from active plan directly
    if (!sessionId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('active_plan_id')
        .eq('id', user.id)
        .single()
      if (!profile?.active_plan_id) return
      const { data: plan } = await supabase
        .from('training_plans')
        .select('exercises')
        .eq('id', profile.active_plan_id)
        .single()
      if (!plan) return
      const exs = (plan.exercises as { name: string }[]).map((e, i) => ({ name: e.name, index: i }))
      setExercises(exs)
      setFeedbacks(exs.map(e => ({ exercise_id: String(e.index), difficulty: 'right' as const })))
      setLoaded(true)
      return
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('plan_id')
      .eq('id', sessionId)
      .single()
    if (!session) return

    const { data: plan } = await supabase
      .from('training_plans')
      .select('exercises')
      .eq('id', session.plan_id)
      .single()
    if (!plan) return

    const exs = (plan.exercises as { name: string }[]).map((e, i) => ({ name: e.name, index: i }))
    setExercises(exs)
    setFeedbacks(exs.map(e => ({ exercise_id: String(e.index), difficulty: 'right' as const })))
    setLoaded(true)
  }

  const updateFeedback = (index: number, difficulty: SessionFeedback['difficulty']) => {
    setFeedbacks(prev => prev.map((f, i) => i === index ? { ...f, difficulty } : f))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, feedback: feedbacks }),
    })
    router.push('/dashboard')
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--background)', maxWidth: 430, margin: '0 auto' }}
    >
      {/* Ambient victory glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(240,160,75,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Hero header */}
      <div className="relative z-10 px-6 pt-12 pb-8 text-center animate-slide-up">
        <div
          className="text-phase mb-3"
          style={{ color: 'var(--primary)', letterSpacing: '0.2em' }}
        >
          TRAINING ABGESCHLOSSEN
        </div>
        <h1
          className="font-display uppercase"
          style={{ fontSize: 'clamp(3rem, 16vw, 5rem)', lineHeight: 0.95, color: 'var(--foreground)' }}
        >
          Gut<span style={{ color: 'var(--primary)' }}>gemacht</span>
        </h1>
        <p
          className="text-sm mt-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          Wie war jede Übung? Dein Plan wird angepasst.
        </p>
      </div>

      {/* Divider */}
      <div
        className="mx-6 mb-6"
        style={{ height: 1, background: 'var(--border)' }}
      />

      {/* Exercise scorecard */}
      <div className="relative z-10 flex-1 px-4 space-y-3 pb-4">
        {!loaded && (
          <div className="flex items-center justify-center py-12">
            <span
              className="text-phase animate-pulse"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.2em' }}
            >
              LADEN...
            </span>
          </div>
        )}
        {exercises.map((ex, i) => {
          const selected = feedbacks[i]?.difficulty
          const selectedOpt = DIFFICULTY_OPTIONS.find(o => o.value === selected)
          return (
            <div
              key={i}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
            >
              <div
                className="rounded-xl p-3"
                style={{
                  background: selectedOpt ? selectedOpt.bg : 'var(--card)',
                  border: `1px solid ${selectedOpt ? selectedOpt.color + '40' : 'var(--border)'}`,
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Exercise name */}
                <div
                  className="font-display uppercase text-sm mb-2"
                  style={{ color: 'var(--foreground)', letterSpacing: '0.08em' }}
                >
                  {ex.name}
                </div>
                {/* Rating buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  {DIFFICULTY_OPTIONS.map(opt => {
                    const isSelected = selected === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => updateFeedback(i, opt.value as SessionFeedback['difficulty'])}
                        className="flex flex-col items-center gap-0.5 rounded-lg py-2 transition-all"
                        style={{
                          background: isSelected ? opt.bg : 'transparent',
                          border: `1px solid ${isSelected ? opt.color : 'var(--border)'}`,
                          transform: isSelected ? 'scale(1.04)' : 'scale(1)',
                        }}
                      >
                        <span style={{ fontSize: '1.1rem' }}>{opt.emoji}</span>
                        <span
                          style={{
                            fontSize: '0.55rem',
                            fontFamily: 'var(--font-display)',
                            letterSpacing: '0.06em',
                            color: isSelected ? opt.color : 'var(--text-muted)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Submit */}
      <div
        className="relative z-10 px-6 py-6"
        style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom, 0px))' }}
      >
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !loaded}
          className="btn-primary w-full rounded-2xl py-4 font-display text-lg tracking-widest uppercase disabled:opacity-50"
        >
          {isSubmitting ? 'PLAN WIRD ANGEPASST...' : 'PLAN ANPASSEN →'}
        </button>
      </div>
    </main>
  )
}

export default function FeedbackPage() {
  return <Suspense><FeedbackForm /></Suspense>
}
