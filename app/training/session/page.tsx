'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SessionPlayer from '@/components/training/SessionPlayer'
import { PHYSIO_CONSENT_MESSAGE, requiresPhysioConsent } from '@/lib/physio/consent'
import type { Exercise, Language } from '@/lib/types'
import type { TranscriptMessage } from '@/lib/mem0'

export default function TrainingSessionPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [planId, setPlanId] = useState<string>()
  const [sessionId, setSessionId] = useState<string>()
  const [sessionNumber, setSessionNumber] = useState(1)
  const [coachLanguage, setCoachLanguage] = useState<Language>('de')
  const [isLoading, setIsLoading] = useState(true)
  const [requiresConsent, setRequiresConsent] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadPlan().catch(err => {
      console.error('Failed to load training plan:', err)
      router.push('/dashboard')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadPlan = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('active_plan_id')
      .eq('id', user.id)
      .single()

    const { data: personality } = await supabase
      .from('user_personality')
      .select('language')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.active_plan_id) { router.push('/dashboard'); return }

    const { data: plan } = await supabase
      .from('training_plans')
      .select('id, exercises, contraindications')
      .eq('id', profile.active_plan_id)
      .single()

    if (!plan) { router.push('/dashboard'); return }

    const resolvedPlanId = typeof plan.id === 'string' ? plan.id : profile.active_plan_id
    setPlanId(resolvedPlanId)

    const { count } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    setSessionNumber((count ?? 0) + 1)

    setCoachLanguage(personality?.language === 'en' ? 'en' : 'de')
    setExercises(plan.exercises as Exercise[])

    const consentStorageKey = `physiobot:physio-consent:${resolvedPlanId}`
    const hasConsent = typeof window !== 'undefined'
      && window.sessionStorage.getItem(consentStorageKey) === 'accepted'

    if (requiresPhysioConsent(plan)) {
      setRequiresConsent(!hasConsent)
      if (!hasConsent) {
        setIsLoading(false)
        return
      }
    } else {
      setRequiresConsent(false)
    }

    await createSessionRecord(supabase, user.id, resolvedPlanId)
    setIsLoading(false)
  }

  const createSessionRecord = async (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    resolvedPlanId: string,
  ) => {
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({ plan_id: resolvedPlanId, user_id: userId })
      .select()
      .single()

    if (sessionError || !session) {
      console.error('Failed to create session record:', sessionError)
      setSessionId(undefined)
      return
    }

    setSessionId(session.id)
  }

  const acceptPhysioConsent = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !planId) {
      router.push('/dashboard')
      return
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`physiobot:physio-consent:${planId}`, 'accepted')
    }

    setRequiresConsent(false)
    setIsLoading(true)
    await createSessionRecord(supabase, user.id, planId)
    setIsLoading(false)
  }

  const handleSessionComplete = async (payload: { transcript: TranscriptMessage[]; completedExercises: Exercise[] }) => {
    if (typeof window !== 'undefined') {
      const storageKey = sessionId ? `session-transcript:${sessionId}` : 'session-transcript:pending'
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload))
    }
    const query = sessionId ? `?session=${sessionId}` : ''
    router.push(`/training/feedback${query}`)
  }

  if (isLoading) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <div
          className="text-phase animate-pulse"
          style={{ color: 'var(--primary)', letterSpacing: '0.2em' }}
        >
          TRAINING WIRD GELADEN
        </div>
      </main>
    )
  }

  if (requiresConsent) {
    return (
      <main
        className="min-h-screen px-6 py-12"
        style={{ background: 'var(--background)' }}
      >
        <div className="mx-auto max-w-xl rounded-[28px] border border-white/10 bg-[rgba(15,23,42,0.72)] p-8 text-white shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Physio-Zustimmung</div>
          <h1 className="font-display text-4xl uppercase tracking-tight">Gesundheitsdaten</h1>
          <p className="mt-4 text-sm leading-6 text-white/70">{PHYSIO_CONSENT_MESSAGE}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void acceptPhysioConsent()}
              className="flex-1 rounded-2xl bg-[var(--secondary)] px-5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Zustimmen und starten
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <SessionPlayer
      exercises={exercises}
      onComplete={handleSessionComplete}
      planId={planId}
      sessionId={sessionId}
      sessionNumber={sessionNumber}
      coachLanguage={coachLanguage}
    />
  )
}
