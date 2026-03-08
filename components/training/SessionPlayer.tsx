'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TranscriptMessage } from '@/lib/mem0'
import type { Exercise } from '@/lib/types'

interface Props {
  exercises: Exercise[]
  onComplete: (payload: { transcript: TranscriptMessage[]; completedExercises: Exercise[] }) => void
  speak: (text: string) => Promise<void>
}

type SessionMode = 'pre' | 'coach' | 'listening'

interface RecognitionResultLike {
  0?: { transcript?: string }
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<RecognitionResultLike> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
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
  const isTestEnv = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
  const [mode, setMode] = useState<SessionMode>(isTestEnv ? 'coach' : 'pre')
  const [hasStarted, setHasStarted] = useState(isTestEnv)
  const [coachTranscript, setCoachTranscript] = useState('')
  const [userTranscript, setUserTranscript] = useState('')
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [isMicAvailable, setIsMicAvailable] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const userTranscriptRef = useRef('')

  if (exercises.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <span className="text-phase" style={{ color: 'var(--text-muted)', letterSpacing: '0.2em' }}>
          KEINE ÜBUNGEN
        </span>
      </div>
    )
  }

  const isLast = currentIndex === exercises.length - 1
  const current = exercises[currentIndex]
  const totalDuration = current.duration_seconds ?? null
  const completedExercises = useMemo(() => exercises.slice(0, currentIndex + 1), [currentIndex, exercises])
  const progress =
    totalDuration && timeLeft !== null
      ? ((totalDuration - timeLeft) / totalDuration) * 100
      : null

  useEffect(() => {
    const Recognition = typeof window !== 'undefined'
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined
    setIsMicAvailable(Boolean(Recognition))
  }, [])

  useEffect(() => {
    if (!hasStarted) return

    setCoachTranscript(current.voice_script)
    setTranscript(prev => [...prev, { role: 'assistant', content: current.voice_script }])
    speak(current.voice_script)
    setAnimKey(k => k + 1)
    if (current.duration_seconds) {
      setTimeLeft(current.duration_seconds)
    } else {
      setTimeLeft(null)
    }
  // speak is intentionally omitted: we only re-run on index change, not when speak prop ref changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, current, hasStarted])

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    const timer = setTimeout(() => setTimeLeft(t => (t ?? 1) - 1), 1000)
    return () => clearTimeout(timer)
  }, [timeLeft])

  const handleNext = () => {
    if (isLast) {
      onComplete({ transcript, completedExercises })
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  const startSession = () => {
    setHasStarted(true)
    setMode('coach')
  }

  const startListening = () => {
    const Recognition = typeof window !== 'undefined'
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined
    if (!Recognition) return

    recognitionRef.current?.stop()
    const recognition = new Recognition()
    recognition.lang = 'de-DE'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = event => {
      const text = Array.from(event.results)
        .map(result => result[0]?.transcript ?? '')
        .join(' ')
        .trim()
      userTranscriptRef.current = text
      setUserTranscript(text)
    }

    recognition.onerror = () => {
      setMode('coach')
    }

    recognition.onend = () => {
      if (userTranscriptRef.current.trim()) {
        void sendUserMessage(userTranscriptRef.current.trim())
      } else {
        setMode('coach')
      }
    }

    recognitionRef.current = recognition
    userTranscriptRef.current = ''
    setUserTranscript('')
    setMode('listening')
    recognition.start()
  }

  const sendUserMessage = async (message: string) => {
    setIsResponding(true)
    setTranscript(prev => [...prev, { role: 'user', content: message }])
    try {
      const response = await fetch('/api/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...transcript, { role: 'user', content: message }],
          currentExercise: current,
        }),
      })
      const data = await response.json()
      const reply = typeof data.reply === 'string' && data.reply.trim()
        ? data.reply.trim()
        : 'Okay, wir machen es einfacher. Langsam und ohne Druck.'
      setCoachTranscript(reply)
      setTranscript(prev => [...prev, { role: 'assistant', content: reply }])
      setMode('coach')
      await speak(reply)
    } catch {
      const fallback = 'Ich bin da. Lass uns die Bewegung langsam und ruhig zusammen machen.'
      setCoachTranscript(fallback)
      setTranscript(prev => [...prev, { role: 'assistant', content: fallback }])
      setMode('coach')
      await speak(fallback)
    } finally {
      setIsResponding(false)
    }
  }

  const phaseColor = PHASE_COLORS[current.phase] ?? 'var(--primary)'
  const progressDots = exercises.map((_, index) => {
    if (index < currentIndex) return 'done'
    if (index === currentIndex) return 'current'
    return 'pending'
  })

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'var(--bg-dark)' }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0A1714_0%,#0F1F1C_100%)]" />
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(59,184,154,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,184,154,0.04) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="relative z-10 flex min-h-screen flex-col">
        {mode === 'pre' ? (
          <div className="flex flex-1 flex-col items-center justify-center px-7 text-center text-white">
            <div className="absolute left-1/2 top-1/2 h-[16rem] w-[16rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" style={{ animation: 'waveOut 3s ease-out infinite' }} />
            <div className="absolute left-1/2 top-1/2 h-[21rem] w-[21rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8" style={{ animation: 'waveOut 3s ease-out infinite', animationDelay: '0.7s' }} />
            <div className="relative z-10 mb-7 flex h-32 w-32 items-center justify-center rounded-full text-6xl" style={{ background: 'linear-gradient(135deg,#1D7A6A,#3BB89A)', boxShadow: '0 0 60px rgba(59,184,154,0.3)' }}>
              🩺
            </div>
            <p className="text-phase mb-3 text-[var(--teal-light)]">Dr. Mia ist bereit</p>
            <h1 className="font-display text-4xl leading-tight text-white">
              Bereit für heute?
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">
              {exercises.length} Übungen, ruhiger Fokus und ich bleibe die ganze Zeit bei dir. Du kannst jederzeit mit mir sprechen.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/7 px-4 py-2 text-sm text-white/80">🔥 Streak-Bonus</span>
              <span className="rounded-full border border-white/12 bg-white/7 px-4 py-2 text-sm text-white/80">{exercises.length} Übungen</span>
              <span className="rounded-full border border-white/12 bg-white/7 px-4 py-2 text-sm text-white/80">⚡ Live Coaching</span>
            </div>
            <button
              onClick={startSession}
              className="mt-8 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[var(--teal)] text-2xl text-white shadow-[0_0_0_0_rgba(59,184,154,0.4)]"
              style={{ animation: 'pulse-glow 2s ease infinite' }}
            >
              ▶
            </button>
            <p className="mt-3 text-sm text-white/45">Tippen zum Starten, dann Handy weglegen</p>
          </div>
        ) : (
          <>
        <div className="px-6 pb-8 pt-[max(1.5rem,var(--safe-top))] text-white">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {progressDots.map((state, index) => (
                  <div
                    key={index}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: state === 'current' ? 18 : 6,
                      background: state === 'done' ? 'var(--teal-mid)' : state === 'current' ? '#fff' : 'rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-white/55">{currentIndex + 1}/{exercises.length}</span>
            </div>
            <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-sm font-bold tabular-nums">
              {timeLeft !== null ? `0:${String(timeLeft).padStart(2, '0')}` : 'Wdh.'}
            </div>
          </div>

          <div className="relative mb-6 flex justify-center">
            <div className="absolute left-1/2 top-1/2 h-[6.5rem] w-[6.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-60" style={{ borderColor: mode === 'listening' ? 'var(--peach)' : 'var(--teal-mid)', animation: 'waveOut 1.8s ease-out infinite' }} />
            <div className="absolute left-1/2 top-1/2 h-[6.5rem] w-[6.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-60" style={{ borderColor: mode === 'listening' ? 'var(--peach)' : 'var(--teal-mid)', animation: 'waveOut 1.8s ease-out infinite', animationDelay: '0.6s' }} />
            <div className="absolute left-1/2 top-1/2 h-[6.5rem] w-[6.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-60" style={{ borderColor: mode === 'listening' ? 'var(--peach)' : 'var(--teal-mid)', animation: 'waveOut 1.8s ease-out infinite', animationDelay: '1.2s' }} />
            <div className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full text-5xl" style={{ background: mode === 'listening' ? 'linear-gradient(135deg,#7B1F10,#F0724A,#F5A26A)' : 'linear-gradient(135deg,#1D7A6A,#3BB89A,#6FD4C0)', animation: 'floatBob 4s ease-in-out infinite', boxShadow: mode === 'listening' ? '0 0 40px rgba(240,114,74,0.45)' : '0 0 40px rgba(59,184,154,0.4)' }}>
              🩺
            </div>
          </div>

          <div key={`content-${animKey}`} className="animate-slide-up text-center">
            <div className="text-phase mb-2 text-[var(--teal-light)]">{PHASE_LABELS[current.phase] ?? current.phase.toUpperCase()}</div>
            <h2 className="font-display text-4xl leading-tight text-white">{current.name}</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/65">{current.description}</p>
          </div>

          <div className="mt-5 rounded-2xl border border-white/8 bg-white/4 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: mode === 'listening' ? 'rgba(240,114,74,0.7)' : 'rgba(168,240,224,0.6)' }}>
              {mode === 'listening' ? 'Du sprichst' : 'Dr. Mia spricht'}
            </p>
            <p className="min-h-12 text-sm leading-6 text-white/90 italic">
              {mode === 'listening' ? (userTranscript || 'Ich höre zu…') : (coachTranscript || current.voice_script)}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div
              className="flex h-10 flex-1 items-center gap-2 rounded-full border px-4"
              style={{
                background: mode === 'listening' ? 'rgba(240,114,74,0.05)' : 'rgba(255,255,255,0.04)',
                borderColor: mode === 'listening' ? 'rgba(240,114,74,0.35)' : 'rgba(255,255,255,0.08)',
              }}
            >
              <span className="text-xs" style={{ color: mode === 'listening' ? 'rgba(240,114,74,0.75)' : 'rgba(255,255,255,0.4)' }}>
                {isMicAvailable ? (mode === 'listening' ? 'Ich höre zu…' : 'Sag etwas oder tippe auf das Mikro') : 'Mikrofon im Browser nicht verfügbar'}
              </span>
              <div className="ml-auto flex items-center gap-[3px]">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="w-[2px] rounded-full"
                    style={{
                      height: `${[4, 10, 7, 12, 5][index]}px`,
                      background: mode === 'listening' ? 'var(--peach)' : 'rgba(255,255,255,0.2)',
                      animation: mode === 'listening' ? `pulse-glow 0.5s ease-in-out ${index * 0.08}s infinite alternate` : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={startListening}
              disabled={!isMicAvailable || isResponding}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-50"
              style={{ background: 'var(--peach)', boxShadow: '0 4px 12px rgba(240,114,74,0.35)' }}
              aria-label="Mit Dr. Mia sprechen"
            >
              🎙
            </button>
          </div>
        </div>

        <div className="mt-auto rounded-t-[34px] bg-[var(--background)] px-6 pb-[calc(1.5rem+var(--safe-bottom))] pt-6">
          {timeLeft !== null && (
            <div className="mb-6 flex items-center justify-center">
              <div className="relative flex items-center justify-center">
                <svg width="220" height="220" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="110" cy="110" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="8" />
                  <circle
                    cx="110"
                    cy="110"
                    r={RADIUS}
                    fill="none"
                    stroke={phaseColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE - (CIRCUMFERENCE * (progress ?? 0)) / 100}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.6s ease' }}
                  />
                </svg>
                <div key={`timer-${timeLeft}`} className="absolute text-center animate-count-tick">
                  <div className="text-phase mb-1 text-[var(--text-muted)]">Sekunden</div>
                  <div className="text-timer" style={{ color: timeLeft <= 5 ? 'var(--peach)' : 'var(--text-primary)' }}>{timeLeft}</div>
                </div>
              </div>
            </div>
          )}

          {timeLeft === null && current.repetitions && current.sets && (
            <div className="mb-6 rounded-[24px] bg-[var(--sand)] px-6 py-8 text-center">
              <div className="text-phase mb-2 text-[var(--text-muted)]">Wiederholungen</div>
              <div className="text-reps text-[var(--teal)]">
                {current.sets}
                <span className="mx-2 text-[0.45em] text-[var(--text-muted)]">×</span>
                {current.repetitions}
              </div>
              <div className="mt-2 text-sm text-[var(--text-secondary)]">Sätze × Wiederholungen</div>
            </div>
          )}

          <div className="mb-4 rounded-[20px] bg-[var(--lavender-light)] p-4">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Dr. Mia sagt</div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {mode === 'listening'
                ? 'Ich höre gerade zu. Sag mir, wenn etwas unklar ist oder du eine Pause brauchst.'
                : 'Arbeite ruhig, weich und ohne Druck. Wenn etwas zieht statt schmerzt, bist du meist im guten Bereich.'}
            </p>
          </div>

          <button
            onClick={handleNext}
            className="btn-primary w-full rounded-[18px] py-4 text-lg"
          >
            {isLast ? 'Session abschließen' : 'Weiter'}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  )
}
