'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flame,
  LoaderCircle,
  SkipForward,
  Trophy,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Exercise, SessionFeedback } from '@/lib/types'
import { XP_PER_PHASE } from '@/lib/types'
import type { TranscriptMessage } from '@/lib/mem0'

const PHASE_LABELS: Record<Exercise['phase'], string> = {
  warmup: 'Warm-up',
  main: 'Main',
  cooldown: 'Cool-down',
}

const FEEDBACK_OPTIONS: Array<{
  value: SessionFeedback['difficulty']
  label: string
  icon: LucideIcon
  color: string
  background: string
}> = [
  {
    value: 'well_tolerated',
    label: 'Gut vertragen',
    icon: CheckCircle2,
    color: '#63CDB9',
    background: 'rgba(99,205,185,0.14)',
  },
  {
    value: 'manageable',
    label: 'Noch okay',
    icon: Activity,
    color: '#63B2FF',
    background: 'rgba(99,178,255,0.14)',
  },
  {
    value: 'too_intense',
    label: 'Zu intensiv',
    icon: Flame,
    color: '#F0A04B',
    background: 'rgba(240,160,75,0.14)',
  },
  {
    value: 'painful',
    label: 'Beschwerden',
    icon: AlertTriangle,
    color: '#E85D5D',
    background: 'rgba(232,93,93,0.14)',
  },
] as const

function FeedbackForm() {
  const [feedbacks, setFeedbacks] = useState<SessionFeedback[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [completedExercises, setCompletedExercises] = useState<Exercise[]>([])
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [submitMode, setSubmitMode] = useState<'submit' | 'skip' | null>(null)
  const [loaded, setLoaded] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  useEffect(() => {
    void loadExercises()
    loadStoredSessionData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reviewExercises = useMemo(
    () => (completedExercises.length > 0 ? completedExercises : exercises),
    [completedExercises, exercises]
  )

  useEffect(() => {
    if (reviewExercises.length === 0) return

    setFeedbacks(current => reviewExercises.map((_, index) => ({
      exercise_id: String(index),
      difficulty: current[index]?.difficulty ?? 'well_tolerated',
      notes: current[index]?.notes,
    })))
  }, [reviewExercises])

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

      const planExercises = plan.exercises as Exercise[]
      setExercises(planExercises)
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

    const planExercises = plan.exercises as Exercise[]
    setExercises(planExercises)
    setLoaded(true)
  }

  const updateFeedback = (index: number, difficulty: SessionFeedback['difficulty']) => {
    setFeedbacks(prev => prev.map((feedback, itemIndex) => (
      itemIndex === index ? { ...feedback, difficulty } : feedback
    )))
  }

  const submitFeedback = async (skipPlanAdjustment = false) => {
    setSubmitMode(skipPlanAdjustment ? 'skip' : 'submit')
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          feedback: skipPlanAdjustment ? [] : feedbacks,
          transcript,
          exercises: completedExercises,
          skipPlanAdjustment,
        }),
      })
      router.push('/dashboard')
    } catch (error) {
      console.error('Feedback submission failed:', error)
      setSubmitMode(null)
    }
  }

  const xpGained = useMemo(() => {
    if (reviewExercises.length === 0) return 0
    return reviewExercises.reduce((sum, exercise) => sum + XP_PER_PHASE[exercise.phase], 0)
  }, [reviewExercises])

  const isBusy = submitMode !== null
  const actionLabel = submitMode === 'submit'
    ? 'Plan wird angepasst...'
    : submitMode === 'skip'
      ? 'Wird übersprungen...'
      : 'Feedback senden'

  return (
    <main className="feedback-page vital-gradient relative min-h-screen overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at top, rgba(42, 157, 138, 0.16), transparent 34%)',
        }}
      />

      <div className="feedback-page__shell relative z-10 mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-4 pb-[calc(8.5rem+var(--safe-bottom))] pt-8 md:max-w-3xl md:px-6 lg:max-w-6xl lg:px-8 lg:pb-10 lg:pt-10">
        <section className="feedback-page__header animate-slide-up px-2 pb-8 pt-3 text-center md:px-0 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(18rem,0.8fr)] lg:items-center lg:gap-10 lg:text-left">
          <div>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[rgba(240,160,75,0.18)] bg-[rgba(240,160,75,0.12)] text-[var(--primary)] lg:mx-0">
              <Trophy size={38} strokeWidth={2.25} />
            </div>
            <div className="text-phase mb-3" style={{ color: 'var(--primary)' }}>
              Session geschafft
            </div>
            <h1 className="font-display text-[clamp(3.6rem,12vw,5.8rem)] uppercase leading-[0.9] tracking-[0.01em] text-[var(--foreground)]">
              Stark <span className="italic text-[var(--accent)]">gemacht</span>
            </h1>
            <p className="mx-auto mt-4 max-w-[28rem] text-sm leading-7 text-white/46 lg:mx-0">
              Dr. Mia passt deinen Plan anhand deines Feedbacks an. Wenn du heute nichts anpassen willst,
              kannst du die Auswertung auch direkt überspringen.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 lg:mt-0">
            <div className="metric-card p-4 text-center">
              <Zap className="mx-auto mb-2 text-[var(--accent)]" size={22} />
              <div className="font-display text-2xl leading-none text-white">+{xpGained}</div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-white/36">XP</div>
            </div>
            <div className="metric-card p-4 text-center">
              <Flame className="mx-auto mb-2 text-[var(--primary)]" size={22} />
              <div className="font-display text-2xl leading-none text-white">+1</div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-white/36">Streak</div>
            </div>
            <div className="metric-card p-4 text-center">
              <Wind className="mx-auto mb-2 text-[var(--accent)]" size={22} />
              <div className="font-display text-2xl leading-none text-white">
                {reviewExercises.length}
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-white/36">Übungen</div>
            </div>
          </div>
        </section>

        <section className="feedback-page__content relative z-10 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
          <div className="space-y-4">
            {!loaded && (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-3 text-white/46">
                  <LoaderCircle className="animate-spin" size={18} />
                  <span className="text-phase" style={{ letterSpacing: '0.22em' }}>Feedback wird geladen</span>
                </div>
              </div>
            )}

            {loaded && reviewExercises.length > 0 && (
              <div className="glass-card rounded-[1.35rem] px-4 py-3 text-sm leading-6 text-white/54">
                Bewerte nur die Übungen, die du heute abgeschlossen hast. Kurze Hinweise zu Intensität oder
                Beschwerden helfen Dr. Mia, die nächste Einheit sicherer anzupassen.
              </div>
            )}

            {loaded && reviewExercises.map((exercise, index) => {
              const selected = feedbacks[index]?.difficulty
              const selectedOption = FEEDBACK_OPTIONS.find(option => option.value === selected) ?? FEEDBACK_OPTIONS[0]
              const SelectedIcon = selectedOption.icon
              return (
                <article
                  key={`${exercise.name}-${index}`}
                  className="glass-card animate-slide-up rounded-[1.15rem] px-3.5 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.16)]"
                  style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/28">
                        {index + 1}
                      </div>
                      <h2 className="min-w-0 truncate font-display text-[1.15rem] uppercase leading-none tracking-[0.01em] text-white">
                        {exercise.name}
                      </h2>
                      <div className="shrink-0 rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-white/34">
                        {PHASE_LABELS[exercise.phase]}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div
                        className="hidden min-w-[6.3rem] items-center justify-end gap-1.5 text-[10px] uppercase tracking-[0.14em] sm:flex"
                        style={{ color: selectedOption.color }}
                      >
                        <SelectedIcon size={12} strokeWidth={2.2} />
                        <span>{selectedOption.label}</span>
                      </div>

                      <div className="grid grid-cols-4 gap-1 rounded-full border border-white/8 bg-[rgba(255,255,255,0.03)] p-1">
                        {FEEDBACK_OPTIONS.map(option => {
                          const Icon = option.icon
                          const isSelected = selected === option.value
                          return (
                            <button
                              key={option.value}
                              onClick={() => updateFeedback(index, option.value)}
                              aria-label={`${exercise.name}: ${option.label}`}
                              title={option.label}
                              className="flex h-8 w-8 items-center justify-center rounded-full border transition-all"
                              style={{
                                background: isSelected ? option.background : 'transparent',
                                borderColor: isSelected ? option.color : 'rgba(255,255,255,0.05)',
                                color: isSelected ? option.color : 'rgba(255,255,255,0.24)',
                                boxShadow: isSelected ? `0 8px 18px ${option.color}16` : 'none',
                              }}
                            >
                              <Icon size={14} strokeWidth={isSelected ? 2.4 : 2} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <aside className="mt-6 hidden lg:block">
            <div className="glass-card sticky top-6 rounded-[1.75rem] p-5">
              <div className="text-phase mb-3" style={{ color: 'var(--primary)' }}>
                Nächster Schritt
              </div>
              <h2 className="font-display text-3xl uppercase leading-none text-white">Plan updaten</h2>
              <p className="mt-3 text-sm leading-7 text-white/48">
                Deine Rückmeldung hilft, Belastung und Beschwerden in der nächsten Einheit besser zu steuern.
              </p>

              <div className="mt-6 space-y-3">
                <button
                  onClick={() => void submitFeedback(false)}
                  disabled={isBusy || !loaded}
                  className="btn-primary w-full rounded-2xl py-4 text-base disabled:opacity-50"
                >
                  {actionLabel}
                </button>
                <button
                  onClick={() => void submitFeedback(true)}
                  disabled={isBusy || !loaded}
                  className="w-full rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/72 transition hover:bg-white/7 disabled:opacity-50"
                >
                  Feedback überspringen
                </button>
              </div>
            </div>
          </aside>
        </section>
      </div>

      <div className="bottom-nav-shell lg:hidden">
        <div className="bottom-nav grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <button
            onClick={() => void submitFeedback(false)}
            disabled={isBusy || !loaded}
            className="btn-primary min-h-[3.75rem] rounded-[1rem] px-4 text-sm uppercase tracking-[0.14em] disabled:opacity-50"
          >
            {actionLabel}
          </button>
          <button
            onClick={() => void submitFeedback(true)}
            disabled={isBusy || !loaded}
            className="inline-flex min-h-[3.75rem] items-center justify-center gap-2 rounded-[1rem] border border-white/10 bg-white/4 px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72 transition hover:bg-white/7 disabled:opacity-50"
          >
            <SkipForward size={16} />
            Überspringen
          </button>
        </div>
      </div>
    </main>
  )
}

export default function FeedbackPage() {
  return (
    <Suspense>
      <FeedbackForm />
    </Suspense>
  )
}
