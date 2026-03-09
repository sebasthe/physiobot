'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createVoiceProvider } from '@/lib/voice'
import SessionPlayer from '@/components/training/SessionPlayer'
import type { Exercise } from '@/lib/types'
import type { TranscriptMessage } from '@/lib/mem0'

export default function TrainingSessionPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [sessionId, setSessionId] = useState<string>()
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const voiceRef = useRef<ReturnType<typeof createVoiceProvider> | null>(null)
  if (!voiceRef.current) {
    voiceRef.current = createVoiceProvider()
  }
  const voice = voiceRef.current

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

    if (!profile?.active_plan_id) { router.push('/dashboard'); return }

    const { data: plan } = await supabase
      .from('training_plans')
      .select('exercises')
      .eq('id', profile.active_plan_id)
      .single()

    if (!plan) { router.push('/dashboard'); return }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({ plan_id: profile.active_plan_id, user_id: user.id })
      .select()
      .single()

    if (sessionError || !session) {
      console.error('Failed to create session record:', sessionError)
      // Continue anyway — session tracking failed but training can still proceed
      // Use a placeholder so the URL isn't "?session=undefined"
      setSessionId(undefined)
    } else {
      setSessionId(session.id)
    }
    setExercises(plan.exercises as Exercise[])
    setIsLoading(false)
  }

  const handleComplete = async () => {
    voice.stop()
    const query = sessionId ? `?session=${sessionId}` : ''
    router.push(`/training/feedback${query}`)
  }

  const handleSessionComplete = async (payload: { transcript: TranscriptMessage[]; completedExercises: Exercise[] }) => {
    voice.stop()
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

  return (
    <SessionPlayer
      exercises={exercises}
      onComplete={handleSessionComplete}
      speak={(text) => voice.speak(text)}
      stopSpeaking={() => voice.stop()}
    />
  )
}
