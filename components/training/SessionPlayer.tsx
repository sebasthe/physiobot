'use client'
import { useState, useEffect } from 'react'
import type { Exercise } from '@/lib/types'

interface Props {
  exercises: Exercise[]
  onComplete: () => void
  speak: (text: string) => Promise<void>
}

const PHASE_COLORS: Record<string, string> = {
  warmup: '#4CAF82',
  main: '#F0A04B',
  cooldown: '#7A9EBF',
}

const PHASE_LABELS: Record<string, string> = {
  warmup: 'AUFWÄRMEN',
  main: 'HAUPTTEIL',
  cooldown: 'COOLDOWN',
}

const RADIUS = 80
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function SessionPlayer({ exercises, onComplete, speak }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [animKey, setAnimKey] = useState(0)

  const isLast = currentIndex === exercises.length - 1
  const current = exercises[currentIndex]
  const totalDuration = current.duration_seconds ?? null
  const progress =
    totalDuration && timeLeft !== null
      ? ((totalDuration - timeLeft) / totalDuration) * 100
      : null

  useEffect(() => {
    speak(current.voice_script)
    setAnimKey(k => k + 1)
    if (current.duration_seconds) {
      setTimeLeft(current.duration_seconds)
    } else {
      setTimeLeft(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    const timer = setTimeout(() => setTimeLeft(t => (t ?? 1) - 1), 1000)
    return () => clearTimeout(timer)
  }, [timeLeft])

  const handleNext = () => {
    if (isLast) {
      onComplete()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  const phaseColor = PHASE_COLORS[current.phase] ?? 'var(--primary)'

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      {/* Phase-reactive ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 30%, ${phaseColor}1A 0%, transparent 70%)`,
          transition: 'background 0.6s ease',
        }}
      />

      {/* Top: phase indicator + session progress */}
      <div className="relative z-10 px-6 pt-12">
        {/* Thin progress bar */}
        <div
          className="h-px w-full rounded-full mb-4"
          style={{ background: 'var(--border)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${((currentIndex + 1) / exercises.length) * 100}%`,
              background: phaseColor,
              transition: 'width 0.4s ease, background 0.6s ease',
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span
            className="text-phase"
            style={{ color: phaseColor, transition: 'color 0.6s ease' }}
          >
            {PHASE_LABELS[current.phase] ?? current.phase.toUpperCase()}
          </span>
          <span
            style={{
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.75rem',
              letterSpacing: '0.12em',
            }}
          >
            {currentIndex + 1} / {exercises.length}
          </span>
        </div>
      </div>

      {/* Center: exercise name + timer/reps */}
      <div
        key={`content-${animKey}`}
        className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 animate-slide-up"
      >
        <h2
          className="text-display-xl text-center uppercase mb-3"
          style={{ color: 'var(--foreground)' }}
        >
          {current.name}
        </h2>
        <p
          className="text-sm text-center max-w-xs leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {current.description}
        </p>

        {/* Countdown timer with SVG arc */}
        {timeLeft !== null && (
          <div className="mt-8 relative flex items-center justify-center">
            <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
              <circle
                cx="100"
                cy="100"
                r={RADIUS}
                fill="none"
                stroke="var(--border)"
                strokeWidth="3"
              />
              <circle
                cx="100"
                cy="100"
                r={RADIUS}
                fill="none"
                stroke={phaseColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={
                  CIRCUMFERENCE - (CIRCUMFERENCE * (progress ?? 0)) / 100
                }
                style={{
                  transition: 'stroke-dashoffset 1s linear, stroke 0.6s ease',
                }}
              />
            </svg>
            <div
              key={`timer-${timeLeft}`}
              className="absolute text-timer animate-count-tick"
              style={{
                color: timeLeft <= 5 ? 'var(--destructive)' : 'var(--foreground)',
                transition: 'color 0.3s ease',
              }}
            >
              {timeLeft}
            </div>
          </div>
        )}

        {/* Reps/sets display */}
        {timeLeft === null && current.repetitions && current.sets && (
          <div className="mt-8 text-center">
            <div className="text-reps" style={{ color: 'var(--primary)' }}>
              {current.sets}
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.4em',
                  margin: '0 0.3em',
                }}
              >
                ×
              </span>
              {current.repetitions}
            </div>
            <div
              style={{
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.65rem',
                letterSpacing: '0.18em',
                marginTop: '0.25rem',
              }}
            >
              SÄTZE × WIEDERHOLUNGEN
            </div>
          </div>
        )}
      </div>

      {/* Bottom: action button */}
      <div
        className="relative z-10 px-6"
        style={{ paddingBottom: 'calc(2rem + var(--safe-bottom, 0px))' }}
      >
        <button
          onClick={handleNext}
          className="btn-primary animate-pulse-glow w-full rounded-2xl py-5 font-display text-xl tracking-widest uppercase"
        >
          {isLast ? 'Abschließen' : 'Weiter →'}
        </button>
      </div>
    </div>
  )
}
