'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import { persistLanguageCookie } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase/client'
import type { MotivationStyle, FeedbackStyle, Language } from '@/lib/types'
import { DEFAULT_USER_PERSONALITY } from '@/lib/user-personality'

interface Question {
  id: string
  question: string
  subtext?: string
  options: { value: string; label: string; description: string; emoji: string }[]
}

export default function PersonalityOnboardingPage() {
  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState<Record<string, string>>({
    ...DEFAULT_USER_PERSONALITY,
  })
  const [isLoading, setIsLoading] = useState(false)
  const { messages, setLocale } = useI18n()
  const router = useRouter()
  const questions: Question[] = [
    {
      id: 'motivation_style',
      question: messages.onboarding.personality.questions.motivation.question,
      subtext: messages.onboarding.personality.questions.motivation.subtext,
      options: [
        { value: 'goal_oriented', label: messages.onboarding.personality.questions.motivation.goalOriented.label, description: messages.onboarding.personality.questions.motivation.goalOriented.description, emoji: '🎯' },
        { value: 'pain_avoidance', label: messages.onboarding.personality.questions.motivation.painAvoidance.label, description: messages.onboarding.personality.questions.motivation.painAvoidance.description, emoji: '💪' },
        { value: 'mixed', label: messages.onboarding.personality.questions.motivation.mixed.label, description: messages.onboarding.personality.questions.motivation.mixed.description, emoji: '⚡' },
      ],
    },
    {
      id: 'feedback_style',
      question: messages.onboarding.personality.questions.feedback.question,
      subtext: messages.onboarding.personality.questions.feedback.subtext,
      options: [
        { value: 'energetic', label: messages.onboarding.personality.questions.feedback.energetic.label, description: messages.onboarding.personality.questions.feedback.energetic.description, emoji: '🔥' },
        { value: 'direct', label: messages.onboarding.personality.questions.feedback.direct.label, description: messages.onboarding.personality.questions.feedback.direct.description, emoji: '⚡' },
        { value: 'gentle', label: messages.onboarding.personality.questions.feedback.gentle.label, description: messages.onboarding.personality.questions.feedback.gentle.description, emoji: '🌿' },
      ],
    },
    {
      id: 'coach_persona',
      question: messages.onboarding.personality.questions.persona.question,
      options: [
        { value: 'tony_robbins', label: messages.onboarding.personality.questions.persona.energizer.label, description: messages.onboarding.personality.questions.persona.energizer.description, emoji: '🚀' },
        { value: 'calm_coach', label: messages.onboarding.personality.questions.persona.calm.label, description: messages.onboarding.personality.questions.persona.calm.description, emoji: '🧘' },
        { value: 'drill_sergeant', label: messages.onboarding.personality.questions.persona.drill.label, description: messages.onboarding.personality.questions.persona.drill.description, emoji: '🎖️' },
      ],
    },
    {
      id: 'language',
      question: messages.onboarding.personality.questions.language.question,
      options: [
        { value: 'de', label: messages.onboarding.personality.questions.language.de.label, description: messages.onboarding.personality.questions.language.de.description, emoji: '🇩🇪' },
        { value: 'en', label: messages.onboarding.personality.questions.language.en.label, description: messages.onboarding.personality.questions.language.en.description, emoji: '🇬🇧' },
      ],
    },
  ]

  const current = questions[step]
  const progress = ((step + 1) / questions.length) * 100
  const selectedValue = selections[current.id]

  const handleSelect = (value: string) => {
    setSelections(prev => ({ ...prev, [current.id]: value }))
  }

  const handleNext = async () => {
    if (step < questions.length - 1) {
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
    const nextLanguage = selections.language === 'en' ? 'en' : 'de'
    persistLanguageCookie(nextLanguage)
    setLocale(nextLanguage)
    router.push('/onboarding/health-profile')
  }

  return (
    <main className="vital-gradient mx-auto flex min-h-screen max-w-xl flex-col px-5 pt-safe md:max-w-4xl md:px-6 lg:max-w-5xl lg:px-8" style={{ paddingTop: 'max(24px, var(--safe-top))' }}>
      <div className="mb-6 flex justify-end">
        <LanguageToggle />
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-phase" style={{ color: 'var(--text-muted)', letterSpacing: '0.15em', fontSize: '0.65rem' }}>
            {messages.onboarding.personality.step.toUpperCase()} {step + 1} {messages.onboarding.personality.of.toUpperCase()} {questions.length}
          </span>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              {messages.onboarding.personality.back}
            </button>
          )}
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: 'var(--primary)' }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="mb-8 animate-slide-up md:max-w-2xl" key={step}>
        <h2 className="font-display uppercase mb-2" style={{ fontSize: 'clamp(1.8rem, 8vw, 2.8rem)', lineHeight: 1, color: 'var(--foreground)' }}>
          {current.question}
        </h2>
        {current.subtext && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{current.subtext}</p>
        )}
      </div>

      {/* Options */}
      <div className="flex-1 space-y-3 animate-slide-up md:grid md:grid-cols-2 md:gap-4 md:space-y-0" key={`options-${step}`}>
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
          {isLoading ? messages.onboarding.personality.saving : step < questions.length - 1 ? messages.onboarding.personality.next : messages.onboarding.personality.finish}
        </button>
      </div>
    </main>
  )
}
