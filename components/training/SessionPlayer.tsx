'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Mic, MicOff, Send } from 'lucide-react'
import type { TranscriptMessage as MemoryTranscriptMessage } from '@/lib/mem0'
import type { Exercise } from '@/lib/types'
import {
  BrowserSTT,
  BrowserTTS,
  ElevenLabsSTT,
  ElevenLabsTTS,
  FetchSSEProvider,
  TranscriptView,
  VoiceStatusIndicator,
  WORKOUT_TOOLS,
  executeToolCall,
  useVoiceSession,
  validateToolCall,
  type STTProvider,
  type TTSProvider,
  type TranscriptMessage as VoiceTranscriptMessage,
  type TurnContext,
  type TurnState,
  type VoiceConfig,
  type WorkoutState,
} from '@/lib/voice-module'

interface Props {
  exercises: Exercise[]
  onComplete: (payload: { transcript: MemoryTranscriptMessage[]; completedExercises: Exercise[] }) => void
  sessionId?: string
}

type VoiceProviderKind = 'browser' | 'elevenlabs' | 'none'

const PHASE_COLORS: Record<Exercise['phase'], string> = {
  warmup: '#4CAF82',
  main: '#F0A04B',
  cooldown: '#7A9EBF',
}

const PHASE_LABELS: Record<Exercise['phase'], string> = {
  warmup: 'AUFWAERMEN',
  main: 'HAUPTTEIL',
  cooldown: 'COOLDOWN',
}

const DEFAULT_SYSTEM_PROMPT = [
  'Du bist Dr. Mia, eine ruhige und motivierende Physio-Coachin.',
  'Antworte kurz, konkret und sicher.',
  'Wenn der Nutzer den Workout-Ablauf aendern will, verwende die passenden Tools.',
].join(' ')

function createSilentSTT(): STTProvider {
  let active = false
  return {
    start: async () => {
      active = true
    },
    stop: () => {
      active = false
    },
    isActive: () => active,
    onPartialTranscript: null,
    onCommittedTranscript: null,
    onError: null,
  }
}

function createSilentTTS(): TTSProvider {
  return {
    speak: async () => undefined,
    stop: () => undefined,
    isSpeaking: () => false,
  }
}

function supportsBrowserSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false
  const scope = window as unknown as Record<string, unknown>
  return typeof scope.SpeechRecognition === 'function' || typeof scope.webkitSpeechRecognition === 'function'
}

function supportsBrowserTTS(): boolean {
  return typeof window !== 'undefined'
    && typeof window.speechSynthesis !== 'undefined'
    && typeof window.SpeechSynthesisUtterance !== 'undefined'
}

function resolveInitialSTTKind(preferred: VoiceProviderKind): VoiceProviderKind {
  if (preferred === 'elevenlabs') {
    return 'elevenlabs'
  }

  return supportsBrowserSpeechRecognition() ? 'browser' : 'none'
}

function createSTTProvider(kind: VoiceProviderKind): STTProvider {
  switch (kind) {
    case 'elevenlabs':
      return new ElevenLabsSTT({ language: 'de', tokenEndpoint: '/api/voice/tokens' })
    case 'browser':
      return supportsBrowserSpeechRecognition()
        ? new BrowserSTT({ language: 'de-DE' })
        : createSilentSTT()
    default:
      return createSilentSTT()
  }
}

function createTTSProvider(kind: VoiceProviderKind): TTSProvider {
  if (kind === 'elevenlabs') {
    return new ElevenLabsTTS({
      streamEndpoint: '/api/voice/stream',
      fullEndpoint: '/api/voice',
      maxStreamLength: 1200,
      fallbackLanguage: 'de-DE',
    })
  }

  return supportsBrowserTTS() ? new BrowserTTS({ language: 'de-DE' }) : createSilentTTS()
}

function createInitialWorkoutState(exercises: Exercise[]): WorkoutState {
  return {
    sessionId: crypto.randomUUID?.() ?? `session-${Date.now()}`,
    status: 'active',
    currentExerciseIndex: 0,
    startedAt: new Date().toISOString(),
    exercises: exercises.map((exercise, index) => ({
      id: `exercise-${index}`,
      name: exercise.name,
      phase: exercise.phase,
      type: exercise.duration_seconds ? 'timed' : 'reps',
      targetDuration: exercise.duration_seconds,
      targetSets: exercise.sets,
      targetReps: exercise.repetitions,
      completedSets: 0,
      remainingSeconds: exercise.duration_seconds,
      status: index === 0 ? 'active' : 'pending',
    })),
  }
}

function advanceWorkoutState(state: WorkoutState): WorkoutState {
  const next = cloneWorkoutState(state)
  const current = next.exercises[next.currentExerciseIndex]

  if (current) {
    current.status = 'completed'
    if (current.type === 'timed') {
      current.remainingSeconds = 0
    } else if (current.targetSets) {
      current.completedSets = current.targetSets
    }
  }

  if (next.currentExerciseIndex < next.exercises.length - 1) {
    next.currentExerciseIndex += 1
    const upcoming = next.exercises[next.currentExerciseIndex]
    if (upcoming) {
      upcoming.status = 'active'
      if (upcoming.type === 'timed' && typeof upcoming.targetDuration === 'number') {
        upcoming.remainingSeconds = upcoming.targetDuration
      }
    }
  }

  return next
}

function decrementTimer(state: WorkoutState): WorkoutState {
  const next = cloneWorkoutState(state)
  const current = next.exercises[next.currentExerciseIndex]

  if (!current || current.type !== 'timed' || next.status !== 'active') {
    return state
  }

  current.remainingSeconds = Math.max(0, (current.remainingSeconds ?? current.targetDuration ?? 0) - 1)
  if (current.remainingSeconds === 0) {
    current.status = 'completed'
  }

  return next
}

function cloneWorkoutState(state: WorkoutState): WorkoutState {
  if (typeof structuredClone === 'function') {
    return structuredClone(state)
  }

  return JSON.parse(JSON.stringify(state)) as WorkoutState
}

function toMemoryTranscript(messages: VoiceTranscriptMessage[]): MemoryTranscriptMessage[] {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
  }))
}

function excerptCoachCopy(text: string): string {
  const source = text.replace(/\s+/g, ' ').trim()
  if (source.length <= 210) return source

  const sentences = source.match(/[^.!?]+[.!?]?/g) ?? [source]
  let excerpt = ''
  for (const sentence of sentences) {
    const candidate = `${excerpt} ${sentence}`.trim()
    if (candidate.length > 210) break
    excerpt = candidate
  }

  if (excerpt) return excerpt
  return `${source.slice(0, 207).trimEnd()}...`
}

export default function SessionPlayer({ exercises, onComplete, sessionId }: Props) {
  const preferredProvider: VoiceProviderKind = process.env.NEXT_PUBLIC_VOICE_PROVIDER === 'elevenlabs'
    ? 'elevenlabs'
    : 'browser'
  const [sttKind, setSttKind] = useState<VoiceProviderKind>(() => resolveInitialSTTKind(preferredProvider))
  const [workoutState, setWorkoutState] = useState<WorkoutState>(() => createInitialWorkoutState(exercises))
  const [typedMessage, setTypedMessage] = useState('')
  const [draftTranscript, setDraftTranscript] = useState('')
  const [voiceHint, setVoiceHint] = useState<string>()
  const [isMicEnabled, setIsMicEnabled] = useState(false)
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false)
  const [sessionTranscript, setSessionTranscript] = useState<VoiceTranscriptMessage[]>([])
  const [pendingIntroIndex, setPendingIntroIndex] = useState<number | null>(exercises.length > 0 ? 0 : null)
  const [isCueSpeaking, setIsCueSpeaking] = useState(false)
  const processedTranscriptCountRef = useRef(0)
  const preferredTTSKind = preferredProvider === 'elevenlabs' ? 'elevenlabs' : 'browser'

  const sttProvider = useMemo(() => createSTTProvider(sttKind), [sttKind])
  const ttsProvider = useMemo(() => createTTSProvider(preferredTTSKind), [preferredTTSKind])
  const llmProvider = useMemo(() => new FetchSSEProvider({ endpoint: '/api/voice/realtime/stream' }), [])
  const voiceConfig = useMemo<VoiceConfig>(() => ({
    stt: sttKind,
    tts: preferredTTSKind === 'elevenlabs' ? 'elevenlabs' : 'browser',
    llmEndpoint: '/api/voice/realtime/stream',
    autoListen: false,
    language: 'de-DE',
  }), [preferredTTSKind, sttKind])

  const currentIndex = workoutState.currentExerciseIndex
  const currentExercise = exercises[currentIndex]
  const currentExerciseState = workoutState.exercises[currentIndex]
  const isLast = currentIndex === exercises.length - 1

  useEffect(() => {
    setWorkoutState(createInitialWorkoutState(exercises))
    setSessionTranscript([])
    setTypedMessage('')
    setDraftTranscript('')
    setVoiceHint(undefined)
    setPendingIntroIndex(exercises.length > 0 ? 0 : null)
    processedTranscriptCountRef.current = 0
  }, [exercises])

  const buildTurnContext = (): TurnContext => ({
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    tools: WORKOUT_TOOLS,
    metadata: {
      sessionId,
      sessionNumber: 1,
      currentExercise: currentExercise
        ? {
            name: currentExercise.name,
            description: currentExercise.description,
            phase: currentExercise.phase,
          }
        : null,
      workoutState,
    },
  })

  const finishSession = (state: WorkoutState, mode: 'complete' | 'partial') => {
    setIsMicEnabled(false)
    setDraftTranscript('')
    ttsProvider.stop()

    const completedExercises = mode === 'complete'
      ? exercises.slice(0, Math.min(exercises.length, state.currentExerciseIndex + 1))
      : exercises.slice(0, Math.max(1, state.currentExerciseIndex))

    onComplete({
      transcript: toMemoryTranscript(sessionTranscript),
      completedExercises,
    })
  }

  const handleVoiceError = (error: Error) => {
    setVoiceHint(error.message || 'Voice-Fehler. Du kannst weiter tippen.')
  }

  const handleStartListeningFailure = (error: unknown) => {
    if (sttKind === 'elevenlabs' && supportsBrowserSpeechRecognition()) {
      setSttKind('browser')
      setVoiceHint('Realtime-Voice nicht verfuegbar. Wechsel auf Browser-Spracherkennung.')
      return
    }

    setIsMicEnabled(false)
    setSttKind(supportsBrowserSpeechRecognition() ? 'browser' : 'none')
    setVoiceHint(error instanceof Error ? error.message : 'Sprachaufnahme ist hier eingeschraenkt. Bitte tippe.')
  }

  const {
    turnState,
    transcript: voiceTranscript,
    sendMessage,
    startListening,
    stopListening,
    interrupt,
  } = useVoiceSession({
    config: voiceConfig,
    stt: sttProvider,
    tts: ttsProvider,
    llm: llmProvider,
    onPartialTranscript: text => {
      setDraftTranscript(text)
      setVoiceHint(undefined)
    },
    onCommittedTranscript: text => {
      setDraftTranscript(text)
      void handleUserTurn(text)
    },
    onToolCall: tool => {
      const validation = validateToolCall(tool.name, tool.input, workoutState)
      if (!validation.valid) {
        setVoiceHint(validation.reason ?? 'Aktion nicht moeglich.')
        return
      }

      const nextState = executeToolCall(tool.name, tool.input, workoutState)
      setWorkoutState(nextState)
      setPendingIntroIndex(nextState.currentExerciseIndex)

      if (tool.name === 'end_session' || nextState.status === 'completed') {
        finishSession(nextState, 'complete')
      }
    },
    onError: handleVoiceError,
  })

  useEffect(() => {
    if (voiceTranscript.length <= processedTranscriptCountRef.current) return

    const nextMessages = voiceTranscript.slice(processedTranscriptCountRef.current)
    processedTranscriptCountRef.current = voiceTranscript.length
    setSessionTranscript(previous => [...previous, ...nextMessages])
  }, [voiceTranscript])

  useEffect(() => {
    if (!currentExercise || pendingIntroIndex !== currentIndex || turnState !== 'idle') {
      return
    }

    const intro = currentExercise.voice_script.trim()
    if (!intro) {
      setPendingIntroIndex(null)
      return
    }

    setPendingIntroIndex(null)
    setDraftTranscript('')
    setVoiceHint(undefined)
    setSessionTranscript(previous => {
      const last = previous[previous.length - 1]
      if (last?.role === 'assistant' && last.content === intro) {
        return previous
      }

      return [
        ...previous,
        {
          role: 'assistant',
          content: intro,
          timestamp: Date.now(),
        },
      ]
    })

    let cancelled = false
    setIsCueSpeaking(true)
    void ttsProvider.speak(intro)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setIsCueSpeaking(false)
        }
      })

    return () => {
      cancelled = true
      setIsCueSpeaking(false)
      ttsProvider.stop()
    }
  }, [currentExercise, currentIndex, pendingIntroIndex, ttsProvider, turnState])

  useEffect(() => {
    if (workoutState.status !== 'active' || currentExerciseState?.type !== 'timed') {
      return
    }

    const remainingSeconds = currentExerciseState.remainingSeconds ?? currentExerciseState.targetDuration ?? 0
    if (remainingSeconds <= 0) {
      return
    }

    const timerId = window.setTimeout(() => {
      setWorkoutState(previous => decrementTimer(previous))
    }, 1000)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [currentExerciseState, workoutState.status])

  useEffect(() => {
    if (!isMicEnabled || sttKind === 'none' || workoutState.status !== 'active' || turnState !== 'idle') {
      stopListening()
      return
    }

    const timerId = window.setTimeout(() => {
      void startListening().catch(handleStartListeningFailure)
    }, 180)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [isMicEnabled, startListening, stopListening, sttKind, turnState, workoutState.status])

  const effectiveTurnState: TurnState = isCueSpeaking && turnState === 'idle' ? 'speaking' : turnState
  const coachCopy = currentExercise ? excerptCoachCopy(
    [...sessionTranscript].reverse().find(message => message.role === 'assistant')?.content ?? currentExercise.voice_script,
  ) : ''
  const phaseColor = currentExercise ? PHASE_COLORS[currentExercise.phase] ?? 'var(--primary)' : 'var(--primary)'

  async function handleUserTurn(message: string) {
    const trimmed = message.trim()
    if (!trimmed || !currentExercise) return

    interrupt()
    ttsProvider.stop()
    setTypedMessage('')
    setDraftTranscript('')
    setVoiceHint(undefined)

    try {
      await sendMessage(trimmed, buildTurnContext())
    } catch (error) {
      handleVoiceError(error instanceof Error ? error : new Error('Nachricht konnte nicht gesendet werden'))
    }
  }

  async function handleRepeat() {
    if (!currentExercise) return
    interrupt()
    setVoiceHint(undefined)
    setIsCueSpeaking(true)
    try {
      await ttsProvider.speak(currentExercise.voice_script)
      setSessionTranscript(previous => [
        ...previous,
        {
          role: 'assistant',
          content: currentExercise.voice_script,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setIsCueSpeaking(false)
    }
  }

  function handleNext() {
    interrupt()
    ttsProvider.stop()
    setDraftTranscript('')

    if (isLast) {
      const completedState = cloneWorkoutState(workoutState)
      const current = completedState.exercises[completedState.currentExerciseIndex]
      if (current) {
        current.status = 'completed'
      }
      completedState.status = 'completed'
      finishSession(completedState, 'complete')
      return
    }

    const nextState = advanceWorkoutState(workoutState)
    setWorkoutState(nextState)
    setPendingIntroIndex(nextState.currentExerciseIndex)
  }

  function handlePauseToggle() {
    if (workoutState.status === 'paused') {
      setWorkoutState(previous => ({ ...previous, status: 'active' }))
      setVoiceHint(undefined)
      return
    }

    stopListening()
    ttsProvider.stop()
    interrupt()
    setWorkoutState(previous => ({ ...previous, status: 'paused' }))
    setVoiceHint('Session pausiert.')
  }

  function handleStop() {
    finishSession(workoutState, 'partial')
  }

  async function handleCopyTranscript() {
    if (sessionTranscript.length === 0) {
      setVoiceHint('Noch kein Transkript zum Kopieren.')
      return
    }

    const exportText = sessionTranscript
      .map(message => `${message.role === 'assistant' ? 'Dr. Mia' : 'Du'}: ${message.content}`)
      .join('\n')

    try {
      await navigator.clipboard.writeText(exportText)
      setVoiceHint('Transkript kopiert.')
    } catch {
      setVoiceHint('Kopieren nicht moeglich. Bitte Text manuell markieren.')
    }
  }

  function handleMicToggle() {
    if (sttKind === 'none') {
      setVoiceHint('Sprachaufnahme ist hier nicht verfuegbar.')
      return
    }

    if (isMicEnabled) {
      setIsMicEnabled(false)
      stopListening()
      setDraftTranscript('')
      setVoiceHint('Mikrofon aus.')
      return
    }

    setIsMicEnabled(true)
    setVoiceHint('Mikrofon aktiv. Ich hoere zu.')
  }

  if (exercises.length === 0 || !currentExercise || !currentExerciseState) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <span className="text-phase" style={{ color: 'var(--text-muted)', letterSpacing: '0.2em' }}>
          KEINE UEBUNGEN
        </span>
      </div>
    )
  }

  return (
    <div
      className="session-player relative h-[100svh] max-h-[100svh] overflow-hidden"
      style={{ background: '#020303' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(59,184,154,0.14),transparent_24%),linear-gradient(180deg,#030404_0%,#010202_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[39%] h-80 w-80 -translate-x-1/2 rounded-full bg-[rgba(69,205,183,0.06)] blur-3xl" />
      <div className="session-player__shell relative z-10 mx-auto grid h-[100svh] max-h-[100svh] w-full max-w-md overflow-hidden px-7 pb-[calc(1rem+var(--safe-bottom))] pt-[max(1.1rem,var(--safe-top))] text-white">
        <div className="session-player__topbar mb-[clamp(1rem,3vh,1.6rem)] flex items-center justify-between">
          <button
            onClick={handleStop}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition-colors hover:text-white"
            aria-label="Session beenden"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-3 px-4">
            <div className="h-[3px] w-36 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#D99A4E] transition-all"
                style={{ width: `${((currentIndex + 1) / exercises.length) * 100}%` }}
              />
            </div>
            <span className="text-[11px] uppercase tracking-[0.24em] text-white/50">
              {currentIndex + 1} / {exercises.length}
            </span>
          </div>
          <button
            onClick={() => setIsTranscriptExpanded(previous => !previous)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition-colors hover:text-white"
            aria-label={isTranscriptExpanded ? 'Transkript einklappen' : 'Transkript ausklappen'}
          >
            {isTranscriptExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
          </button>
        </div>

        <div className="session-player__hero flex flex-col items-center text-center">
          <div className="mb-4">
            <VoiceStatusIndicator
              state={effectiveTurnState}
              className="border-white/8 bg-white/4 text-white/80"
              labels={{
                idle: 'Bereit',
                listening: 'Hoert zu',
                processing: 'Versteht',
                speaking: 'Antwortet',
              }}
            />
          </div>

          <div className="session-player__hero-inner w-full">
            <p className="text-phase mb-3 text-center" style={{ color: phaseColor, letterSpacing: '0.38em' }}>
              {PHASE_LABELS[currentExercise.phase] ?? currentExercise.phase}
            </p>
            <h1 className="session-player__title w-full px-2 text-center font-display text-[clamp(3.8rem,11vw,5.4rem)] uppercase leading-[0.9] tracking-[0.01em] text-white">
              {currentExercise.name}
            </h1>
          </div>
        </div>

        <div className="session-player__body overflow-hidden">
          <div className="session-player__timer relative flex h-[min(17.75rem,34vh)] w-[min(17.75rem,34vh)] min-h-[13.5rem] min-w-[13.5rem] items-center justify-center rounded-full border-[8px] border-[rgba(110,235,220,0.86)] shadow-[0_0_48px_rgba(66,209,192,0.12)]">
            <div className="absolute inset-5 rounded-full bg-[radial-gradient(circle,rgba(39,116,104,0.16),transparent_68%)]" />
            {currentExerciseState.type === 'timed' ? (
              <div className="relative z-10 flex flex-col items-center justify-center">
                <span className="font-display text-[clamp(5rem,16vh,8rem)] leading-[0.88] tracking-[0.01em] text-white">
                  {currentExerciseState.remainingSeconds ?? currentExercise.duration_seconds ?? 0}
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.28em] text-white/26">Sekunden</span>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col items-center justify-center">
                <span className="font-display text-[clamp(5rem,16vh,8rem)] leading-[0.88] tracking-[0.01em] text-white">
                  {currentExercise.repetitions ?? currentExerciseState.targetReps ?? 8}
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.28em] text-white/26">Wiederholungen</span>
              </div>
            )}
          </div>

          <div className="session-player__copy-wrap flex min-h-0 w-full flex-col items-center justify-start overflow-hidden px-3">
            <p
              className="session-player__copy max-w-[18.75rem] text-center text-[clamp(0.95rem,3.05vw,1.35rem)] italic leading-[1.48] text-white/56"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 6,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              "{coachCopy}"
            </p>

            {(draftTranscript || voiceHint) && (
              <p className="session-player__hint mt-4 max-w-[18rem] px-4 text-center text-[10px] uppercase tracking-[0.2em] text-white/26">
                {draftTranscript || voiceHint}
              </p>
            )}
          </div>

          <div className="session-player__controls w-full pb-2 pt-[clamp(0.5rem,1.8vh,1rem)]">
            <div className="grid grid-cols-4 items-center gap-4">
              <button
                onClick={() => void handleRepeat()}
                disabled={effectiveTurnState === 'processing'}
                className="mx-auto flex h-[4.1rem] w-[4.1rem] items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.05] text-white/34 transition-colors hover:text-white disabled:opacity-50"
                aria-label="Nochmal"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.69" />
                  <path d="M4 4v5h5" />
                </svg>
              </button>

              <button
                onClick={handleMicToggle}
                disabled={sttKind === 'none' || workoutState.status === 'paused'}
                className="mx-auto flex h-[4.1rem] w-[4.1rem] items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.05] text-white/34 transition-colors hover:text-white disabled:opacity-40"
                aria-label={isMicEnabled ? 'Mikrofon aus' : 'Mikrofon an'}
              >
                {isMicEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>

              <button
                onClick={handlePauseToggle}
                className="mx-auto flex h-[5.4rem] w-[5.4rem] items-center justify-center rounded-full bg-[#8FE8D9] text-white shadow-[0_0_72px_rgba(99,205,185,0.2)]"
                aria-label={workoutState.status === 'paused' ? 'Fortsetzen' : 'Pause'}
              >
                {workoutState.status === 'paused' ? (
                  <svg viewBox="0 0 24 24" className="h-10 w-10 translate-x-[1px]" fill="currentColor" aria-hidden="true">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" rx="1.5" />
                    <rect x="14" y="4" width="4" height="16" rx="1.5" />
                  </svg>
                )}
              </button>

              <button
                onClick={handleNext}
                className="mx-auto flex h-[4.1rem] w-[4.1rem] items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.05] text-white/34 transition-colors hover:text-white"
                aria-label={isLast ? 'Session abschließen' : 'Weiter'}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 5v14" />
                  <path d="M9 7l8 5-8 5V7z" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[1.7rem] border border-white/8 bg-white/[0.04] p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/36">Voice-Konsole</div>
                <div className="mt-1 text-sm text-white/70">
                  {sttKind === 'elevenlabs'
                    ? 'Realtime STT + Tool-Steuerung'
                    : sttKind === 'browser'
                      ? 'Browser-Spracherkennung aktiv'
                      : 'Textmodus'}
                </div>
              </div>
              <button
                onClick={() => void handleCopyTranscript()}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-white/42 transition-colors hover:text-white"
                aria-label="Transkript kopieren"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>

            <form
              className="flex items-center gap-2"
              onSubmit={event => {
                event.preventDefault()
                void handleUserTurn(typedMessage)
              }}
            >
              <input
                value={typedMessage}
                onChange={event => setTypedMessage(event.target.value)}
                placeholder="Coach etwas sagen oder tippen..."
                className="h-12 flex-1 rounded-full border border-white/8 bg-black/20 px-4 text-sm text-white placeholder:text-white/24 outline-none transition-colors focus:border-white/18"
              />
              <button
                type="submit"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-[0_14px_30px_rgba(240,160,75,0.18)] disabled:opacity-50"
                aria-label="Nachricht senden"
                disabled={!typedMessage.trim()}
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            {isTranscriptExpanded && (
              <div className="mt-4">
                <TranscriptView
                  messages={sessionTranscript}
                  className="max-h-48 bg-black/20"
                  userLabel="Du"
                  assistantLabel="Dr. Mia"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
