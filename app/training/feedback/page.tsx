'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Exercise, SessionFeedback } from '@/lib/types'
import type { TranscriptMessage } from '@/lib/mem0'

const DIFFICULTY_OPTIONS = [
  { value: 'too_easy',  emoji: '🌟', label: 'Zu leicht', color: '#63B2FF', bg: 'rgba(99,178,255,0.12)' },
  { value: 'right',     emoji: '✅', label: 'Passt',     color: '#4CAF82', bg: 'rgba(76,175,130,0.12)' },
  { value: 'too_hard',  emoji: '🔥', label: 'Zu hart',   color: '#F0A04B', bg: 'rgba(240,160,75,0.12)' },
  { value: 'painful',   emoji: '⚠️', label: 'Schmerz',   color: '#E85D5D', bg: 'rgba(232,93,93,0.12)' },
] as const

function FeedbackForm() {
  const [feedbacks, setFeedbacks] = useState<SessionFeedback[]>([])
  const [exercises, setExercises] = useState<{ name: string; index: number }[]>([])
  const [completedExercises, setCompletedExercises] = useState<Exercise[]>([])
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  useEffect(() => {
    loadExercises()
    loadStoredSessionData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadStoredSessionData = () => {
    if (typeof window === 'undefined') return
    const key = sessionId ? `session-transcript:${sessionId}` : 'session-transcript:pending'
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as { transcript?: TranscriptMessage[]; completedExercises?: Exercise[] }
      setTranscript(parsed.transcript ?? [])
      setCompletedExercises(parsed.completedExercises ?? [])
      window.sessionStorage.removeItem(key)
    } catch {
      window.sessionStorage.removeItem(key)
    }
  }

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
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, feedback: feedbacks, transcript, exercises: completedExercises }),
      })
      router.push('/dashboard')
    } catch (err) {
      console.error('Feedback submission failed:', err)
      setIsSubmitting(false)
    }
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--background)', maxWidth: 430, margin: '0 auto' }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(29,122,106,0.09) 0%, transparent 70%)' }} />

      <div className="relative z-10 px-6 pb-8 pt-12 text-center animate-slide-up">
        <div className="mx-auto mb-4 flex h-20 w-20 animate-pulse-glow items-center justify-center rounded-full bg-[var(--gold-light)] text-4xl">
          🏆
        </div>
        <div className="text-phase mb-3" style={{ color: 'var(--teal)' }}>
          Session geschafft
        </div>
        <h1 className="font-display text-5xl leading-none text-[var(--foreground)]">
          Stark <span style={{ color: 'var(--teal)' }}>gemacht</span>
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Dr. Mia passt deinen Plan anhand deines Feedbacks an.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white px-3 py-4 shadow-[var(--shadow-sm)]">
            <div className="text-xl">⚡</div>
            <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">+40</div>
            <div className="text-[11px] text-[var(--text-muted)]">XP</div>
          </div>
          <div className="rounded-2xl bg-white px-3 py-4 shadow-[var(--shadow-sm)]">
            <div className="text-xl">🔥</div>
            <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">+1</div>
            <div className="text-[11px] text-[var(--text-muted)]">Streak</div>
          </div>
          <div className="rounded-2xl bg-white px-3 py-4 shadow-[var(--shadow-sm)]">
            <div className="text-xl">🌿</div>
            <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{exercises.length}</div>
            <div className="text-[11px] text-[var(--text-muted)]">Übungen</div>
          </div>
        </div>
      </div>

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
                  className="font-display text-xl mb-3"
                  style={{ color: 'var(--foreground)' }}
                >
                  {ex.name}
                </div>
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
                            fontFamily: 'var(--font-body)',
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

      <div
        className="relative z-10 px-6 py-6"
        style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom, 0px))' }}
      >
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !loaded}
          className="btn-primary w-full rounded-2xl py-4 text-lg disabled:opacity-50"
        >
          {isSubmitting ? 'Plan wird angepasst...' : 'Feedback senden'}
        </button>
      </div>
    </main>
  )
}

export default function FeedbackPage() {
  return <Suspense><FeedbackForm /></Suspense>
}
