'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { MotivationStyle, FeedbackStyle, Language } from '@/lib/types'

interface Question {
  id: string
  question: string
  subtext?: string
  options: { value: string; label: string; description: string; emoji: string }[]
}

const QUESTIONS: Question[] = [
  {
    id: 'motivation_style',
    question: 'Was treibt dich an?',
    subtext: 'Dein Coach passt sich deiner Motivation an.',
    options: [
      { value: 'goal_oriented', label: 'Ziele erreichen', description: 'Ich will konkrete Meilensteine setzen und übertreffen', emoji: '🎯' },
      { value: 'pain_avoidance', label: 'Schmerzen loswerden', description: 'Ich will Einschränkungen überwinden und schmerzfrei leben', emoji: '💪' },
      { value: 'mixed', label: 'Beides', description: 'Schmerzen reduzieren und gleichzeitig stärker werden', emoji: '⚡' },
    ],
  },
  {
    id: 'feedback_style',
    question: 'Wie soll dich dein Coach ansprechen?',
    subtext: 'Du kannst das später jederzeit ändern.',
    options: [
      { value: 'energetic', label: 'Energiegeladen', description: 'Motivierend, enthusiastisch, mit Power', emoji: '🔥' },
      { value: 'direct', label: 'Direkt & fordernd', description: 'Klar, kein Drum-herum, hohe Erwartungen', emoji: '⚡' },
      { value: 'gentle', label: 'Sanft & ermutigend', description: 'Geduldig, verständnisvoll, ruhiger Rhythmus', emoji: '🌿' },
    ],
  },
  {
    id: 'coach_persona',
    question: 'Welcher Coach-Typ passt zu dir?',
    options: [
      { value: 'tony_robbins', label: 'Der Energizer', description: 'Grenzen sprengen, maximales Potenzial — Tony Robbins Energie', emoji: '🚀' },
      { value: 'calm_coach', label: 'Der Ruhige', description: 'Fokus, Atemkontrolle, methodisch — wie ein Yoga-Sportcoach', emoji: '🧘' },
      { value: 'drill_sergeant', label: 'Der Forderer', description: 'Keine Ausreden, maximale Disziplin — militärische Präzision', emoji: '🎖️' },
    ],
  },
  {
    id: 'language',
    question: 'In welcher Sprache soll dein Coach sprechen?',
    options: [
      { value: 'de', label: 'Deutsch', description: 'Coaching auf Deutsch', emoji: '🇩🇪' },
      { value: 'en', label: 'English', description: 'Coaching in English', emoji: '🇬🇧' },
    ],
  },
]

export default function PersonalityOnboardingPage() {
  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState<Record<string, string>>({
    motivation_style: 'mixed',
    feedback_style: 'energetic',
    coach_persona: 'tony_robbins',
    language: 'de',
  })
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const current = QUESTIONS[step]
  const progress = ((step + 1) / QUESTIONS.length) * 100
  const selectedValue = selections[current.id]

  const handleSelect = (value: string) => {
    setSelections(prev => ({ ...prev, [current.id]: value }))
  }

  const handleNext = async () => {
    if (step < QUESTIONS.length - 1) {
      setStep(s => s + 1)
      return
    }
    setIsLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { error } = await supabase.from('user_personality').upsert({
      user_id: user.id,
      motivation_style: selections.motivation_style as MotivationStyle,
      feedback_style: selections.feedback_style as FeedbackStyle,
      language: selections.language as Language,
      coach_persona: selections.coach_persona,
    }, { onConflict: 'user_id' })

    if (error) {
      console.error('Failed to save personality:', error)
    }
    router.push('/onboarding/health-profile')
  }

  return (
    <main className="min-h-screen flex flex-col px-5 pt-safe" style={{ paddingTop: 'max(24px, var(--safe-top))' }}>
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-phase" style={{ color: 'var(--text-muted)', letterSpacing: '0.15em', fontSize: '0.65rem' }}>
            SCHRITT {step + 1} VON {QUESTIONS.length}
          </span>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              ← Zurück
            </button>
          )}
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: 'var(--primary)' }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="mb-8 animate-slide-up" key={step}>
        <h2 className="font-display uppercase mb-2" style={{ fontSize: 'clamp(1.8rem, 8vw, 2.8rem)', lineHeight: 1, color: 'var(--foreground)' }}>
          {current.question}
        </h2>
        {current.subtext && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{current.subtext}</p>
        )}
      </div>

      {/* Options */}
      <div className="flex-1 space-y-3 animate-slide-up" key={`options-${step}`}>
        {current.options.map(option => (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            className={`option-card w-full text-left px-4 py-4 flex items-start gap-4 ${selectedValue === option.value ? 'option-card--selected' : ''}`}
          >
            <span className="text-2xl flex-shrink-0 mt-0.5">{option.emoji}</span>
            <div>
              <div className="font-semibold text-sm" style={{ color: selectedValue === option.value ? 'var(--primary)' : 'var(--foreground)' }}>
                {option.label}
              </div>
              <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {option.description}
              </div>
            </div>
            {selectedValue === option.value && (
              <div className="ml-auto flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--primary)' }}>
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="#0D0B09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Next button */}
      <div className="py-6">
        <button
          onClick={handleNext}
          disabled={isLoading || !selectedValue}
          className="btn-primary w-full rounded-xl py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Speichern...' : step < QUESTIONS.length - 1 ? 'Weiter →' : 'Abschließen'}
        </button>
      </div>
    </main>
  )
}
