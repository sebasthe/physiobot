'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Mic, MicOff, Send } from 'lucide-react'
import type { TranscriptMessage as MemoryTranscriptMessage } from '@/lib/mem0'
import type { Exercise } from '@/lib/types'
import {
  describeVoiceDebugText,
  getVoiceDebugSnapshot,
  isVoiceDebugEnabled,
  recordVoiceDebugEvent,
} from '@/lib/voice-debug/client'
import {
  ActionBus,
  BrowserSTT,
  BrowserTTS,
  type BusAction,
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
  sessionNumber?: number
}

type VoiceProviderKind = 'browser' | 'elevenlabs' | 'none'
const AUDIO_UNLOCK_HINT = 'Audio braucht die erste Interaktion. Druecke Nochmal fuer die erste Ansage.'

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
  const silentSTT: STTProvider = {
    start: async () => {
      active = true
      silentSTT.onListeningStateChange?.(true)
    },
    stop: () => {
      active = false
      silentSTT.onListeningStateChange?.(false)
    },
    isActive: () => active,
    onListeningStateChange: null,
    onPartialTranscript: null,
    onCommittedTranscript: null,
    onError: null,
  }

  return silentSTT
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
    && typeof speechSynthesis !== 'undefined'
    && typeof SpeechSynthesisUtterance !== 'undefined'
}

function resolveInitialAudioUnlocked(): boolean {
  if (typeof navigator === 'undefined') return false

  const userActivation = (navigator as Navigator & {
    userActivation?: {
      hasBeenActive?: boolean
    }
  }).userActivation

  return Boolean(userActivation?.hasBeenActive)
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

function createTTSProvider(
  kind: VoiceProviderKind,
  options?: { onFallback?: (error: Error) => void },
): TTSProvider {
  if (kind === 'elevenlabs') {
    return new ElevenLabsTTS({
      streamEndpoint: '/api/voice/stream',
      fullEndpoint: '/api/voice',
      maxStreamLength: 1200,
      fallbackLanguage: 'de-DE',
      onFallback: options?.onFallback,
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

function toPlaybackHint(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : ''
  const normalized = message.toLowerCase()

  if (
    normalized.includes('paid_plan_required')
    || normalized.includes('library voices')
  ) {
    return 'ElevenLabs-Stimme im aktuellen Plan nicht verfuegbar. Nutze Browser-Stimme.'
  }

  if (
    normalized.includes('playback')
    || normalized.includes('notallowed')
    || normalized.includes('gesture')
  ) {
    return 'Audio ist blockiert. Tippe oder druecke Nochmal, um Stimme zu aktivieren.'
  }

  if (message) {
    return `${message}. Tippe oder druecke Nochmal.`
  }

  return 'Audio konnte nicht abgespielt werden. Tippe oder druecke Nochmal.'
}

function toTTSFallbackHint(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : ''
  const normalized = message.toLowerCase()

  if (
    normalized.includes('paid_plan_required')
    || normalized.includes('library voices')
  ) {
    return 'ElevenLabs-Stimme im aktuellen Plan nicht verfuegbar. Wechsel auf Browser-Stimme.'
  }

  if (normalized.includes('unauthorized') || normalized.includes('auth')) {
    return 'ElevenLabs ist nicht autorisiert. Wechsel auf Browser-Stimme.'
  }

  if (normalized.includes('not configured')) {
    return 'ElevenLabs ist nicht konfiguriert. Wechsel auf Browser-Stimme.'
  }

  return 'ElevenLabs-Audio ist nicht verfuegbar. Wechsel auf Browser-Stimme.'
}

export default function SessionPlayer({ exercises, onComplete, sessionId, sessionNumber = 1 }: Props) {
  const preferredProvider: VoiceProviderKind = process.env.NEXT_PUBLIC_VOICE_PROVIDER === 'elevenlabs'
    ? 'elevenlabs'
    : 'browser'
  const initialTTSKind: VoiceProviderKind = preferredProvider === 'elevenlabs' ? 'elevenlabs' : 'browser'
  const initiallyUnlocked = resolveInitialAudioUnlocked()
  const [sttKind, setSttKind] = useState<VoiceProviderKind>(() => resolveInitialSTTKind(preferredProvider))
  const [ttsKind, setTtsKind] = useState<VoiceProviderKind>(initialTTSKind)
  const [hasAudioInteraction, setHasAudioInteraction] = useState<boolean>(initiallyUnlocked)
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
  const cuePlaybackTokenRef = useRef(0)
  const pendingBrowserTTSFallbackRef = useRef(false)
  const autoCueReadyRef = useRef(initiallyUnlocked)
  const voiceDebugEnabled = isVoiceDebugEnabled()

  const sttProvider = useMemo(() => createSTTProvider(sttKind), [sttKind])
  const ttsProvider = useMemo(() => createTTSProvider(ttsKind, {
    onFallback: error => {
      setVoiceHint(toTTSFallbackHint(error))
      if (ttsKind === 'elevenlabs' && supportsBrowserTTS()) {
        pendingBrowserTTSFallbackRef.current = true
      }
    },
  }), [ttsKind])
  const llmProvider = useMemo(() => new FetchSSEProvider({ endpoint: '/api/voice/realtime/stream' }), [])
  const actionBus = useMemo(() => new ActionBus(), [])
  const voiceConfig = useMemo<VoiceConfig>(() => ({
    stt: sttKind,
    tts: ttsKind === 'elevenlabs' ? 'elevenlabs' : 'browser',
    llmEndpoint: '/api/voice/realtime/stream',
    autoListen: false,
    language: 'de-DE',
  }), [sttKind, ttsKind])

  const currentIndex = workoutState.currentExerciseIndex
  const currentExercise = exercises[currentIndex]
  const currentExerciseState = workoutState.exercises[currentIndex]
  const isLast = currentIndex === exercises.length - 1

  const stopCoachAudio = () => {
    cuePlaybackTokenRef.current += 1
    setIsCueSpeaking(false)
    recordVoiceDebugEvent('session-player.audio.stop', {})
    ttsProvider.stop()
  }

  useEffect(() => {
    setWorkoutState(createInitialWorkoutState(exercises))
    setSessionTranscript([])
    setTypedMessage('')
    setDraftTranscript('')
    setVoiceHint(undefined)
    setPendingIntroIndex(exercises.length > 0 ? 0 : null)
    processedTranscriptCountRef.current = 0
  }, [exercises])

  useEffect(() => {
    if (!voiceDebugEnabled) return

    recordVoiceDebugEvent('session-player.init', {
      sessionId,
      exerciseCount: exercises.length,
      preferredProvider,
      initiallyUnlocked,
    })
  }, [exercises.length, initiallyUnlocked, preferredProvider, sessionId, voiceDebugEnabled])

  useEffect(() => {
    if (hasAudioInteraction || typeof window === 'undefined') {
      return
    }

    const unlockAudio = () => {
      setHasAudioInteraction(true)
      recordVoiceDebugEvent('session-player.audio.unlocked', {})
    }

    window.addEventListener('pointerdown', unlockAudio, true)
    window.addEventListener('keydown', unlockAudio, true)
    window.addEventListener('touchstart', unlockAudio, true)

    return () => {
      window.removeEventListener('pointerdown', unlockAudio, true)
      window.removeEventListener('keydown', unlockAudio, true)
      window.removeEventListener('touchstart', unlockAudio, true)
    }
  }, [hasAudioInteraction])

  const buildTurnContext = (): TurnContext => ({
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    tools: WORKOUT_TOOLS,
    metadata: {
      sessionId,
      sessionNumber,
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
    recordVoiceDebugEvent('session-player.finish', {
      mode,
      currentExerciseIndex: state.currentExerciseIndex,
      status: state.status,
      transcriptCount: sessionTranscript.length,
    })
    setIsMicEnabled(false)
    setDraftTranscript('')
    stopCoachAudio()

    const completedExercises = mode === 'complete'
      ? exercises.slice(0, Math.min(exercises.length, state.currentExerciseIndex + 1))
      : exercises.slice(0, Math.max(1, state.currentExerciseIndex))

    onComplete({
      transcript: toMemoryTranscript(sessionTranscript),
      completedExercises,
    })
  }

  const applyWorkoutAction = useEffectEvent((action: BusAction) => {
    recordVoiceDebugEvent('session-player.action', {
      source: action.source,
      action: action.action,
    })

    if (action.source === 'ui') {
      switch (action.action) {
        case 'next_exercise': {
          interrupt()
          stopCoachAudio()
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
          return
        }
        case 'pause_workout':
          stopListening()
          stopCoachAudio()
          interrupt()
          setWorkoutState(previous => ({ ...previous, status: 'paused' }))
          setVoiceHint('Session pausiert.')
          return
        case 'resume_workout':
          setWorkoutState(previous => ({ ...previous, status: 'active' }))
          setVoiceHint(undefined)
          return
        case 'stop_session':
          finishSession(workoutState, 'partial')
          return
        default:
          return
      }
    }

    const validation = validateToolCall(action.action, action.payload, workoutState)
    if (!validation.valid) {
      recordVoiceDebugEvent('session-player.action.rejected', {
        source: action.source,
        action: action.action,
        reason: validation.reason ?? 'Aktion nicht moeglich.',
      })
      setVoiceHint(validation.reason ?? 'Aktion nicht moeglich.')
      return
    }

    const nextState = executeToolCall(action.action, action.payload, workoutState)
    setWorkoutState(nextState)

    if (action.action === 'next_exercise' || action.action === 'previous_exercise') {
      setPendingIntroIndex(nextState.currentExerciseIndex)
    }

    if (action.action === 'pause_workout') {
      setVoiceHint('Session pausiert.')
    } else if (action.action === 'resume_workout') {
      setVoiceHint(undefined)
    }

    if (action.action === 'end_session' || nextState.status === 'completed') {
      finishSession(nextState, 'complete')
    }
  })

  useEffect(() => {
    const handler = (action: BusAction) => {
      applyWorkoutAction(action)
    }

    actionBus.on(handler)
    return () => {
      actionBus.off(handler)
    }
  }, [actionBus])

  useEffect(() => {
    return () => {
      actionBus.destroy()
    }
  }, [actionBus])

  const handleVoiceError = (error: Error) => {
    recordVoiceDebugEvent('session-player.voice-error', {
      message: error.message,
    })
    setVoiceHint(error.message || 'Voice-Fehler. Du kannst weiter tippen.')
  }

  const handleStartListeningFailure = (error: unknown) => {
    if (sttKind === 'elevenlabs' && supportsBrowserSpeechRecognition()) {
      recordVoiceDebugEvent('session-player.listening-failure', {
        message: error instanceof Error ? error.message : String(error),
        fallbackTo: 'browser',
      })
      setSttKind('browser')
      setVoiceHint('Realtime-Voice nicht verfuegbar. Wechsel auf Browser-Spracherkennung.')
      return
    }

    recordVoiceDebugEvent('session-player.listening-failure', {
      message: error instanceof Error ? error.message : String(error),
      fallbackTo: supportsBrowserSpeechRecognition() ? 'browser' : 'none',
    })
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
      recordVoiceDebugEvent('session-player.tool-call.dispatch', {
        name: tool.name,
      })
      actionBus.dispatch({ source: 'voice', action: tool.name, payload: tool.input })
    },
    onError: handleVoiceError,
  })

  useEffect(() => {
    if (voiceTranscript.length <= processedTranscriptCountRef.current) return

    const nextMessages = voiceTranscript.slice(processedTranscriptCountRef.current)
    processedTranscriptCountRef.current = voiceTranscript.length
    recordVoiceDebugEvent('session-player.transcript.append', {
      added: nextMessages.length,
      total: voiceTranscript.length,
    })
    setSessionTranscript(previous => [...previous, ...nextMessages])
  }, [voiceTranscript])

  useEffect(() => {
    if (
      !pendingBrowserTTSFallbackRef.current
      || ttsKind !== 'elevenlabs'
      || turnState !== 'idle'
      || isCueSpeaking
    ) {
      return
    }

    pendingBrowserTTSFallbackRef.current = false
    recordVoiceDebugEvent('session-player.tts.fallback-browser', {})
    setTtsKind('browser')
  }, [isCueSpeaking, ttsKind, turnState])

  useEffect(() => {
    return () => {
      cuePlaybackTokenRef.current += 1
      ttsProvider.stop()
    }
  }, [ttsProvider])

  useEffect(() => {
    if (!currentExercise || pendingIntroIndex !== currentIndex) {
      return
    }

    if (!autoCueReadyRef.current) {
      recordVoiceDebugEvent('session-player.intro.blocked-audio-lock', {
        currentIndex,
      })
      setVoiceHint(previous => previous ?? AUDIO_UNLOCK_HINT)
      return
    }

    if (turnState !== 'idle') {
      return
    }

    const intro = currentExercise.voice_script.trim()
    if (!intro) {
      setPendingIntroIndex(null)
      return
    }

    recordVoiceDebugEvent('session-player.intro.start', {
      currentIndex,
      ...describeVoiceDebugText(intro),
    })
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

    const cuePlaybackToken = cuePlaybackTokenRef.current + 1
    cuePlaybackTokenRef.current = cuePlaybackToken
    setIsCueSpeaking(true)
    void ttsProvider.speak(intro)
      .catch(error => {
        if (cuePlaybackTokenRef.current === cuePlaybackToken) {
          recordVoiceDebugEvent('session-player.intro.error', {
            currentIndex,
            message: error instanceof Error ? error.message : String(error),
          })
          setVoiceHint(toPlaybackHint(error))
        }
      })
      .finally(() => {
        if (cuePlaybackTokenRef.current === cuePlaybackToken) {
          recordVoiceDebugEvent('session-player.intro.end', {
            currentIndex,
          })
          autoCueReadyRef.current = true
          setIsCueSpeaking(false)
        }
      })
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
    if (
      !isMicEnabled
      || sttKind === 'none'
      || workoutState.status !== 'active'
      || turnState !== 'idle'
      || isCueSpeaking
    ) {
      stopListening()
      return
    }

    const timerId = window.setTimeout(() => {
      void startListening().catch(handleStartListeningFailure)
    }, 180)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [isCueSpeaking, isMicEnabled, startListening, stopListening, sttKind, turnState, workoutState.status])

  const effectiveTurnState: TurnState = isCueSpeaking && turnState === 'idle' ? 'speaking' : turnState
  const coachCopy = currentExercise ? excerptCoachCopy(
    [...sessionTranscript].reverse().find(message => message.role === 'assistant')?.content ?? currentExercise.voice_script,
  ) : ''
  const phaseColor = currentExercise ? PHASE_COLORS[currentExercise.phase] ?? 'var(--primary)' : 'var(--primary)'
  const voiceDebugSnapshot = getVoiceDebugSnapshot()

  useEffect(() => {
    if (!voiceDebugEnabled) return

    recordVoiceDebugEvent('session-player.state', {
      currentIndex,
      sessionNumber,
      sttKind,
      ttsKind,
      turnState: effectiveTurnState,
      workoutStatus: workoutState.status,
      isMicEnabled,
      hasAudioInteraction,
      pendingIntroIndex,
      transcriptCount: sessionTranscript.length,
    })
  }, [
    currentIndex,
    effectiveTurnState,
    hasAudioInteraction,
    isMicEnabled,
    pendingIntroIndex,
    sessionNumber,
    sessionTranscript.length,
    sttKind,
    ttsKind,
    voiceDebugEnabled,
    workoutState.status,
  ])

  async function handleUserTurn(message: string) {
    const trimmed = message.trim()
    if (!trimmed || !currentExercise) return

    recordVoiceDebugEvent('session-player.user-turn.submit', describeVoiceDebugText(trimmed))
    interrupt()
    stopCoachAudio()
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
    recordVoiceDebugEvent('session-player.repeat', {
      currentIndex,
      ttsKind,
    })
    setHasAudioInteraction(true)
    if (turnState !== 'idle' || isCueSpeaking || ttsProvider.isSpeaking()) {
      interrupt()
    }
    setVoiceHint(undefined)
    if (pendingIntroIndex === currentIndex) {
      setPendingIntroIndex(null)
    }
    const cuePlaybackToken = cuePlaybackTokenRef.current + 1
    cuePlaybackTokenRef.current = cuePlaybackToken
    setIsCueSpeaking(true)
    try {
      await ttsProvider.speak(currentExercise.voice_script)
      autoCueReadyRef.current = true

      setSessionTranscript(previous => [
        ...previous,
        {
          role: 'assistant',
          content: currentExercise.voice_script,
          timestamp: Date.now(),
        },
      ])
    } catch (error) {
      if (cuePlaybackTokenRef.current === cuePlaybackToken) {
        recordVoiceDebugEvent('session-player.repeat.error', {
          currentIndex,
          message: error instanceof Error ? error.message : String(error),
        })
        setVoiceHint(toPlaybackHint(error))
      }
    } finally {
      if (cuePlaybackTokenRef.current === cuePlaybackToken) {
        setIsCueSpeaking(false)
      }
    }
  }

  function handleNext() {
    recordVoiceDebugEvent('session-player.next', {
      currentIndex,
      isLast,
    })
    actionBus.dispatch({ source: 'ui', action: 'next_exercise', payload: {} })
  }

  function handlePauseToggle() {
    const action = workoutState.status === 'paused' ? 'resume_workout' : 'pause_workout'
    recordVoiceDebugEvent(action === 'resume_workout' ? 'session-player.resume' : 'session-player.pause', {
      currentIndex,
    })
    actionBus.dispatch({ source: 'ui', action, payload: {} })
  }

  function handleStop() {
    recordVoiceDebugEvent('session-player.stop', {
      currentIndex,
    })
    actionBus.dispatch({ source: 'ui', action: 'stop_session', payload: {} })
  }

  async function handleCopyTranscript() {
    if (sessionTranscript.length === 0) {
      recordVoiceDebugEvent('session-player.copy-transcript.empty', {})
      setVoiceHint('Noch kein Transkript zum Kopieren.')
      return
    }

    const exportText = sessionTranscript
      .map(message => `${message.role === 'assistant' ? 'Dr. Mia' : 'Du'}: ${message.content}`)
      .join('\n')

    try {
      await navigator.clipboard.writeText(exportText)
      recordVoiceDebugEvent('session-player.copy-transcript.success', {
        transcriptCount: sessionTranscript.length,
      })
      setVoiceHint('Transkript kopiert.')
    } catch {
      recordVoiceDebugEvent('session-player.copy-transcript.error', {
        transcriptCount: sessionTranscript.length,
      })
      setVoiceHint('Kopieren nicht moeglich. Bitte Text manuell markieren.')
    }
  }

  function handleMicToggle() {
    if (sttKind === 'none') {
      recordVoiceDebugEvent('session-player.mic.unavailable', {})
      setVoiceHint('Sprachaufnahme ist hier nicht verfuegbar.')
      return
    }

    if (isMicEnabled) {
      recordVoiceDebugEvent('session-player.mic.disable', {
        sttKind,
      })
      setIsMicEnabled(false)
      stopListening()
      setDraftTranscript('')
      setVoiceHint('Mikrofon aus.')
      return
    }

    recordVoiceDebugEvent('session-player.mic.enable', {
      sttKind,
    })
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

            {voiceDebugEnabled && (
              <div
                data-testid="voice-debug-panel"
                className="mt-4 rounded-[1.2rem] border border-[#D99A4E]/20 bg-black/25 p-3 text-[11px] text-white/62"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="uppercase tracking-[0.24em] text-[#D99A4E]">Voice Debug</div>
                  <div className="text-white/38">
                    {voiceDebugSnapshot.eventCount} Events
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="text-white/32">Turn</span>
                  <span>{effectiveTurnState}</span>
                  <span className="text-white/32">STT</span>
                  <span>{sttKind}</span>
                  <span className="text-white/32">TTS</span>
                  <span>{ttsKind}</span>
                  <span className="text-white/32">Workout</span>
                  <span>{workoutState.status}</span>
                  <span className="text-white/32">Mic</span>
                  <span>{isMicEnabled ? 'an' : 'aus'}</span>
                  <span className="text-white/32">Audio</span>
                  <span>{hasAudioInteraction ? 'unlocked' : 'locked'}</span>
                  <span className="text-white/32">Intro</span>
                  <span>{pendingIntroIndex === null ? 'idle' : pendingIntroIndex}</span>
                  <span className="text-white/32">Last</span>
                  <span className="truncate">{voiceDebugSnapshot.lastEventType ?? 'none'}</span>
                </div>
              </div>
            )}

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
