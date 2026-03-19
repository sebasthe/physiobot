'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { TranscriptMessage as MemoryTranscriptMessage } from '@/lib/mem0'
import type { TurnMetricsPayload } from '@/lib/telemetry/voice-metrics'
import type { Exercise, Language } from '@/lib/types'
import VoiceGlowFrame from '@/components/training/VoiceGlowFrame'
import {
  describeVoiceDebugText,
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
  KokoroTTS,
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
  type ExerciseState,
  type WorkoutState,
} from '@/lib/voice-module'

interface Props {
  exercises: Exercise[]
  onComplete: (payload: { transcript: MemoryTranscriptMessage[]; completedExercises: Exercise[] }) => void
  planId?: string
  sessionId?: string
  sessionNumber?: number
  coachLanguage?: Language
}

type STTProviderKind = 'browser' | 'elevenlabs' | 'none'
type TTSProviderKind = 'browser' | 'elevenlabs' | 'kokoro'
type KokoroDevicePreference = 'wasm' | 'webgpu' | 'cpu' | 'auto'
const VOICE_UI_IDLE_GRACE_MS = 400
const COACH_CUE_TIMEOUT_MS = 1400

const PHASE_COLORS: Record<Exercise['phase'], string> = {
  warmup: '#4CAF82',
  main: '#F0A04B',
  cooldown: '#7A9EBF',
}

type CoachCueIntent = 'intro' | 'repeat'
type CoachCueSource = 'dynamic' | 'fallback'

interface CoachCueResult {
  text: string
  source: CoachCueSource
}

const DEFAULT_SYSTEM_PROMPT = [
  'Du bist Dr. Mia, eine ruhige und motivierende Physio-Coachin.',
  'Antworte kurz, konkret und sicher.',
  'Wenn der Nutzer den Workout-Ablauf aendern will, verwende die passenden Tools.',
].join(' ')

function buildDefaultSystemPrompt(language: Language): string {
  if (language === 'en') {
    return [
      'You are Dr. Mia, a calm and motivating physiotherapy coach.',
      'Reply briefly, concretely, and safely.',
      'If the user wants to change the workout flow, use the appropriate tools.',
    ].join(' ')
  }

  return DEFAULT_SYSTEM_PROMPT
}

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

function resolveSpeechLocale(language: Language): 'de-DE' | 'en-US' {
  return language === 'en' ? 'en-US' : 'de-DE'
}

function resolveSttLanguage(language: Language): 'de' | 'en' {
  return language === 'en' ? 'en' : 'de'
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

function resolveInitialSTTKind(preferred: TTSProviderKind): STTProviderKind {
  if (preferred === 'elevenlabs') {
    return 'elevenlabs'
  }

  return supportsBrowserSpeechRecognition() ? 'browser' : 'none'
}

function resolveConfiguredCoachLanguage(language: Language): Language {
  const configuredLanguage = process.env.NEXT_PUBLIC_COACH_LANGUAGE
  if (configuredLanguage === 'en' || configuredLanguage === 'de') {
    return configuredLanguage
  }

  return language
}

function resolveConfiguredKokoroDevice(): KokoroDevicePreference {
  const configuredDevice = process.env.NEXT_PUBLIC_KOKORO_DEVICE
  if (
    configuredDevice === 'wasm'
    || configuredDevice === 'webgpu'
    || configuredDevice === 'cpu'
    || configuredDevice === 'auto'
  ) {
    return configuredDevice
  }

  // WebGPU triggers noisy non-fatal ORT warnings in Next dev and shows an overlay.
  // For the normal dev loop we prefer the stable wasm path unless explicitly overridden.
  return 'wasm'
}

function createSTTProviderWithLanguage(kind: STTProviderKind, language: Language): STTProvider {
  const browserLanguage = resolveSpeechLocale(language)
  const realtimeLanguage = resolveSttLanguage(language)

  switch (kind) {
    case 'elevenlabs':
      return new ElevenLabsSTT({ language: realtimeLanguage, tokenEndpoint: '/api/voice/tokens' })
    case 'browser':
      return supportsBrowserSpeechRecognition()
        ? new BrowserSTT({ language: browserLanguage })
        : createSilentSTT()
    default:
      return createSilentSTT()
  }
}

function createTTSProvider(
  kind: TTSProviderKind,
  options?: { onFallback?: (error: Error) => void; onLoadingChange?: (loading: boolean) => void; language?: Language },
): TTSProvider {
  const language = options?.language ?? 'de'
  const speechLocale = resolveSpeechLocale(language)

  if (kind === 'elevenlabs') {
    return new ElevenLabsTTS({
      streamEndpoint: '/api/voice/stream',
      fullEndpoint: '/api/voice',
      maxStreamLength: 1200,
      fallbackLanguage: speechLocale,
      onFallback: options?.onFallback,
    })
  }

  if (kind === 'kokoro') {
    return new KokoroTTS({
      voice: 'af_bella',
      dtype: 'q4',
      device: resolveConfiguredKokoroDevice(),
      webgpuDtype: 'fp32',
      onLoadingChange: options?.onLoadingChange,
    })
  }

  return supportsBrowserTTS() ? new BrowserTTS({ language: speechLocale }) : createSilentTTS()
}

function createInitialWorkoutState(exercises: Exercise[]): WorkoutState {
  return {
    sessionId: crypto.randomUUID?.() ?? `session-${Date.now()}`,
    status: 'active',
    currentExerciseIndex: 0,
    startedAt: new Date().toISOString(),
    exercises: exercises.map((exercise, index) => ({
      id: exercise.id,
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

function toPlaybackHint(error: unknown, language: Language): string {
  const message = error instanceof Error ? error.message.trim() : ''
  const normalized = message.toLowerCase()

  if (
    normalized.includes('paid_plan_required')
    || normalized.includes('library voices')
  ) {
    return language === 'en'
      ? 'The ElevenLabs voice is not available on the current plan. Use the browser voice instead.'
      : 'ElevenLabs-Stimme im aktuellen Plan nicht verfuegbar. Nutze Browser-Stimme.'
  }

  if (
    normalized.includes('playback')
    || normalized.includes('notallowed')
    || normalized.includes('gesture')
  ) {
    return language === 'en'
      ? 'Audio is blocked. Tap or press repeat to enable speech.'
      : 'Audio ist blockiert. Tippe oder druecke Nochmal, um Stimme zu aktivieren.'
  }

  if (message) {
    return language === 'en'
      ? `${message}. Tap or press repeat.`
      : `${message}. Tippe oder druecke Nochmal.`
  }

  return language === 'en'
    ? 'Audio could not be played. Tap or press repeat.'
    : 'Audio konnte nicht abgespielt werden. Tippe oder druecke Nochmal.'
}

function toTTSFallbackHint(error: unknown, language: Language): string {
  const message = error instanceof Error ? error.message.trim() : ''
  const normalized = message.toLowerCase()

  if (
    normalized.includes('paid_plan_required')
    || normalized.includes('library voices')
  ) {
    return language === 'en'
      ? 'The ElevenLabs voice is not available on the current plan. Switching to the browser voice.'
      : 'ElevenLabs-Stimme im aktuellen Plan nicht verfuegbar. Wechsel auf Browser-Stimme.'
  }

  if (normalized.includes('unauthorized') || normalized.includes('auth')) {
    return language === 'en'
      ? 'ElevenLabs is not authorized. Switching to the browser voice.'
      : 'ElevenLabs ist nicht autorisiert. Wechsel auf Browser-Stimme.'
  }

  if (normalized.includes('not configured')) {
    return language === 'en'
      ? 'ElevenLabs is not configured. Switching to the browser voice.'
      : 'ElevenLabs ist nicht konfiguriert. Wechsel auf Browser-Stimme.'
  }

  return language === 'en'
    ? 'ElevenLabs audio is unavailable. Switching to the browser voice.'
    : 'ElevenLabs-Audio ist nicht verfuegbar. Wechsel auf Browser-Stimme.'
}

function isProbablyEnglishText(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false

  if (/[äöüß]/i.test(normalized)) return false

  const germanMarkers = /\b(und|dein|deine|deinen|mit|jetzt|fuer|übung|uebung|mobilisiere|rücken|ruecken|schulter|schmerzen|bewege|halte|atme|langsam|gleichmaessig|aufwärmen|aufwaermen|hauptteil)\b/i
  if (germanMarkers.test(normalized)) return false

  const englishMarkers = /\b(the|and|your|with|move|keep|breathing|shoulders|hips|core|back|exercise|stretch|hold|slowly|gently|begin|start|steady)\b/i
  return englishMarkers.test(normalized)
}

function resolveCueFallback(exercise: Exercise, language: Language): string {
  const storedScript = exercise.voice_script.trim()
  if (language === 'en') {
    if (isProbablyEnglishText(storedScript)) {
      return storedScript
    }

    const description = exercise.description.trim()
    if (isProbablyEnglishText(description)) {
      return `${exercise.name}. ${description}`
    }

    return "Let's begin this exercise. Move with control and steady breathing."
  }

  if (storedScript) {
    return storedScript
  }

  const description = exercise.description.trim()
  if (description) {
    return `${exercise.name}. ${description}`
  }

  return exercise.name.trim()
}

function buildAdaptiveCuePrompt(params: {
  intent: CoachCueIntent
  exercise: Exercise
  exerciseState?: ExerciseState
  language: Language
}): string {
  const { intent, exercise, exerciseState, language } = params

  if (language === 'en') {
    const intentInstruction = intent === 'intro'
      ? 'Guide the user into this exact current exercise now.'
      : 'Write a fresh repeat cue for this exact current exercise.'

    return [
      intentInstruction,
      `Current exercise: ${exercise.name}.`,
      `Description: ${exercise.description}.`,
      `Phase: ${exercise.phase}.`,
      `Status: ${exerciseState?.status ?? 'active'}.`,
      'The training plan stays fixed. Do not change the exercise, duration, reps, or sets.',
      'Speak in the currently configured language for this user and in the user-specific coaching style.',
      'Use fresh, natural phrasing. No hype, no heroic slogans, no all caps.',
      'Maximum 2 short sentences. No lists. No markdown.',
    ].join(' ')
  }

  const intentInstruction = intent === 'intro'
    ? 'Fuehre den Nutzer jetzt in genau diese aktuelle Uebung hinein.'
    : 'Formuliere fuer genau diese aktuelle Uebung einen frischen Wiederholungs-Cue.'

  return [
    intentInstruction,
    `Aktuelle Uebung: ${exercise.name}.`,
    `Beschreibung: ${exercise.description}.`,
    `Phase: ${exercise.phase}.`,
    `Status: ${exerciseState?.status ?? 'active'}.`,
    'Der Trainingsplan bleibt unveraendert. Aendere weder Uebung noch Dauer noch Wiederholungen noch Sets.',
    'Sprich in der aktuell fuer diesen Nutzer konfigurierten Sprache und in seinem persoenlichen Stil.',
    'Nutze frische, natuerliche Formulierungen. Kein Pathos, keine heroischen Slogans, keine Grossbuchstaben.',
    'Maximal 2 kurze Saetze. Keine Listen. Kein Markdown.',
  ].join(' ')
}

export default function SessionPlayer({
  exercises,
  onComplete,
  planId,
  sessionId,
  sessionNumber = 1,
  coachLanguage = 'de',
}: Props) {
  const { messages } = useI18n()
  const preferredProvider: TTSProviderKind = process.env.NEXT_PUBLIC_VOICE_PROVIDER === 'elevenlabs'
    ? 'elevenlabs'
    : process.env.NEXT_PUBLIC_VOICE_PROVIDER === 'kokoro'
      ? 'kokoro'
      : 'browser'
  const initialTTSKind: TTSProviderKind = preferredProvider === 'elevenlabs'
    ? 'elevenlabs'
    : preferredProvider === 'kokoro'
      ? 'kokoro'
      : 'browser'
  const initiallyUnlocked = resolveInitialAudioUnlocked()
  const [sttKind, setSttKind] = useState<STTProviderKind>(() => resolveInitialSTTKind(preferredProvider))
  const [ttsKind, setTtsKind] = useState<TTSProviderKind>(initialTTSKind)
  const [isTtsModelLoading, setIsTtsModelLoading] = useState(false)
  const [hasAudioInteraction, setHasAudioInteraction] = useState<boolean>(initiallyUnlocked)
  const [workoutState, setWorkoutState] = useState<WorkoutState>(() => createInitialWorkoutState(exercises))
  const [draftTranscript, setDraftTranscript] = useState('')
  const [voiceHint, setVoiceHint] = useState<string>()
  const [cuePreviewByIndex, setCuePreviewByIndex] = useState<Record<number, string>>({})
  const [isMicEnabled, setIsMicEnabled] = useState(false)
  const [sessionTranscript, setSessionTranscript] = useState<VoiceTranscriptMessage[]>([])
  const [pendingIntroIndex, setPendingIntroIndex] = useState<number | null>(exercises.length > 0 ? 0 : null)
  const [isCueSpeaking, setIsCueSpeaking] = useState(false)
  const [isVoiceUiGraceActive, setIsVoiceUiGraceActive] = useState(false)
  const [coachCueMode, setCoachCueMode] = useState<'adaptive' | 'local'>('adaptive')
  const processedTranscriptCountRef = useRef(0)
  const cuePlaybackTokenRef = useRef(0)
  const pendingBrowserTTSFallbackRef = useRef(false)
  const autoCueReadyRef = useRef(initiallyUnlocked)
  const prefetchedCueKeyRef = useRef<string | null>(null)
  const cueFallbackHintShownRef = useRef(false)
  const voiceDebugEnabled = isVoiceDebugEnabled()
  const activeTtsKind: TTSProviderKind = ttsKind
  const effectiveCoachLanguage = resolveConfiguredCoachLanguage(coachLanguage)
  const audioUnlockHint = messages.session.audioUnlock
  const kokoroLoadingHint = messages.session.kokoroLoading
  const phaseLabels = messages.session.phases
  const statusLabels = messages.session.statuses

  const speechLocale = resolveSpeechLocale(effectiveCoachLanguage)
  const sttProvider = useMemo(
    () => createSTTProviderWithLanguage(sttKind, effectiveCoachLanguage),
    [effectiveCoachLanguage, sttKind],
  )
  const ttsProvider = useMemo(() => createTTSProvider(activeTtsKind, {
    onFallback: error => {
      setVoiceHint(toTTSFallbackHint(error, effectiveCoachLanguage))
      if (activeTtsKind === 'elevenlabs' && supportsBrowserTTS()) {
        pendingBrowserTTSFallbackRef.current = true
      }
    },
    onLoadingChange: loading => {
      setIsTtsModelLoading(loading)
    },
    language: effectiveCoachLanguage,
  }), [activeTtsKind, effectiveCoachLanguage])
  const llmProvider = useMemo(() => new FetchSSEProvider({ endpoint: '/api/voice/realtime/stream' }), [])
  const actionBus = useMemo(() => new ActionBus(), [])
  const voiceConfig = useMemo<VoiceConfig>(() => ({
    stt: sttKind,
    tts: activeTtsKind === 'elevenlabs' ? 'elevenlabs' : activeTtsKind === 'kokoro' ? 'kokoro' : 'browser',
    llmEndpoint: '/api/voice/realtime/stream',
    autoListen: false,
    language: speechLocale,
  }), [activeTtsKind, speechLocale, sttKind])

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
    setDraftTranscript('')
    setVoiceHint(undefined)
    setPendingIntroIndex(exercises.length > 0 ? 0 : null)
    processedTranscriptCountRef.current = 0
  }, [exercises])

  useEffect(() => {
    setCuePreviewByIndex({})
    prefetchedCueKeyRef.current = null
  }, [effectiveCoachLanguage])

  useEffect(() => {
    setCoachCueMode('adaptive')
    cueFallbackHintShownRef.current = false
  }, [effectiveCoachLanguage, planId, sessionId])

  useEffect(() => {
    if (!voiceDebugEnabled) return

    recordVoiceDebugEvent('session-player.init', {
      sessionId,
      exerciseCount: exercises.length,
      preferredProvider,
      activeTtsKind,
      initiallyUnlocked,
    })
  }, [activeTtsKind, exercises.length, initiallyUnlocked, preferredProvider, sessionId, voiceDebugEnabled])

  useEffect(() => {
    if (hasAudioInteraction || typeof window === 'undefined') {
      return
    }

    const unlockAudio = () => {
      void ttsProvider.prepare?.().catch(error => {
        recordVoiceDebugEvent('session-player.audio.prepare.error', {
          message: error instanceof Error ? error.message : String(error),
        })
      })
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
  }, [hasAudioInteraction, ttsProvider])

  const buildTurnContext = (): TurnContext => ({
    systemPrompt: buildDefaultSystemPrompt(effectiveCoachLanguage),
    tools: WORKOUT_TOOLS,
    metadata: {
      sessionId,
      sessionNumber,
      planId,
      language: effectiveCoachLanguage,
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
          setVoiceHint(messages.session.paused)
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
        reason: validation.reason ?? (effectiveCoachLanguage === 'en' ? 'Action is not available.' : 'Aktion nicht moeglich.'),
      })
      setVoiceHint(validation.reason ?? (effectiveCoachLanguage === 'en' ? 'Action is not available.' : 'Aktion nicht moeglich.'))
      return
    }

    const nextState = executeToolCall(action.action, action.payload, workoutState)
    setWorkoutState(nextState)

    if (action.action === 'next_exercise' || action.action === 'previous_exercise') {
      setPendingIntroIndex(nextState.currentExerciseIndex)
    }

    if (action.action === 'pause_workout') {
      setVoiceHint(messages.session.paused)
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
    setVoiceHint(error.message || (effectiveCoachLanguage === 'en'
      ? 'Voice error. Please use the session controls.'
      : 'Voice-Fehler. Nutze bitte die Session-Steuerung.'))
  }

  const handlePainTool = useEffectEvent(async (input: Record<string, unknown>) => {
    const location = typeof input.location === 'string' ? input.location : ''
    const intensity = typeof input.intensity === 'number' ? input.intensity : Number(input.intensity)
    const type = typeof input.type === 'string' ? input.type : ''

    if (!location || !Number.isFinite(intensity) || !type) {
      setVoiceHint(effectiveCoachLanguage === 'en' ? 'Pain report is incomplete.' : 'Schmerzbericht unvollstaendig.')
      return
    }

    try {
      const response = await fetch('/api/physio/pain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          location,
          intensity,
          type,
          exerciseId: currentExerciseState?.id ?? currentExercise?.name ?? 'current-exercise',
          sessionId,
        }),
      })

      const payload = await response.json().catch(() => ({})) as {
        shouldAbort?: boolean
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? (effectiveCoachLanguage === 'en'
          ? 'Pain report could not be saved.'
          : 'Schmerzbericht konnte nicht gespeichert werden.'))
      }

      if (!payload.shouldAbort) {
        return
      }

      const abortMessage = effectiveCoachLanguage === 'en'
        ? 'The pain is too strong. Let us stop here and please speak with your therapist.'
        : 'Die Schmerzen sind zu stark. Lass uns aufhoeren und sprich bitte mit deinem Therapeuten.'

      interrupt()
      stopCoachAudio()
      setSessionTranscript(previous => [
        ...previous,
        {
          role: 'assistant',
          content: abortMessage,
          timestamp: Date.now(),
        },
      ])

      try {
        await ttsProvider.speak(abortMessage)
      } catch (error) {
        setVoiceHint(toPlaybackHint(error, effectiveCoachLanguage))
      }

      actionBus.dispatch({ source: 'voice', action: 'end_session', payload: {} })
    } catch (error) {
      setVoiceHint(error instanceof Error ? error.message : (effectiveCoachLanguage === 'en'
        ? 'Pain report could not be saved.'
        : 'Schmerzbericht konnte nicht gespeichert werden.'))
    }
  })

  const reportVoiceTelemetry = useEffectEvent(async (
    eventType: 'turn_metrics',
    payload: Record<string, unknown>,
  ) => {
    try {
      await fetch('/api/voice/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          eventType,
          sessionId,
          payload,
        }),
      })
    } catch {
      // Telemetry is best-effort only.
    }
  })

  const handleTurnMetrics = useEffectEvent((metrics: TurnMetricsPayload) => {
    recordVoiceDebugEvent('session-player.turn-metrics', {
      totalTurnTime: metrics.totalTurnTime,
      utteranceCategory: metrics.utteranceCategory,
      skippedReason: metrics.skippedReason,
      llmTimedOut: metrics.llmTimedOut,
    })
    void reportVoiceTelemetry('turn_metrics', metrics as unknown as Record<string, unknown>)
  })

  const handleStartListeningFailure = (error: unknown) => {
    if (sttKind === 'elevenlabs' && supportsBrowserSpeechRecognition()) {
      recordVoiceDebugEvent('session-player.listening-failure', {
        message: error instanceof Error ? error.message : String(error),
        fallbackTo: 'browser',
      })
      setSttKind('browser')
      setVoiceHint(effectiveCoachLanguage === 'en'
        ? 'Realtime voice is unavailable. Switching to browser speech recognition.'
        : 'Realtime-Voice nicht verfuegbar. Wechsel auf Browser-Spracherkennung.')
      return
    }

    recordVoiceDebugEvent('session-player.listening-failure', {
      message: error instanceof Error ? error.message : String(error),
      fallbackTo: supportsBrowserSpeechRecognition() ? 'browser' : 'none',
    })
    setIsMicEnabled(false)
    setSttKind(supportsBrowserSpeechRecognition() ? 'browser' : 'none')
    setVoiceHint(error instanceof Error ? error.message : (effectiveCoachLanguage === 'en'
      ? 'Voice input is limited here. Please use the session controls.'
      : 'Sprachaufnahme ist hier eingeschraenkt. Nutze bitte die Session-Steuerung.'))
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
      if (tool.name === 'log_pain') {
        void handlePainTool(tool.input)
        return
      }
      actionBus.dispatch({ source: 'voice', action: tool.name, payload: tool.input })
    },
    onMetrics: handleTurnMetrics,
    onError: handleVoiceError,
  })

  const requestAdaptiveCue = useEffectEvent(async (
    intent: CoachCueIntent,
    exercise: Exercise,
    exerciseState?: ExerciseState,
  ): Promise<CoachCueResult> => {
    const fallback = resolveCueFallback(exercise, effectiveCoachLanguage)
    if (coachCueMode === 'local') {
      return {
        text: fallback,
        source: 'fallback',
      }
    }

    const recentMessages = sessionTranscript
      .slice(-6)
      .map(message => ({
        role: message.role,
        content: message.content,
      }))

    recordVoiceDebugEvent('session-player.cue.request', {
      intent,
      currentIndex,
      transcriptCount: recentMessages.length,
    })

    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort('coach-cue-timeout'), COACH_CUE_TIMEOUT_MS)

    try {
      const response = await fetch('/api/voice/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          messages: [
            ...recentMessages,
            {
              role: 'user',
              content: buildAdaptiveCuePrompt({
                intent,
                exercise,
                exerciseState,
                language: effectiveCoachLanguage,
              }),
            },
          ],
          currentExercise: {
            name: exercise.name,
            description: exercise.description,
            phase: exercise.phase,
          },
          sessionNumber,
          exercisePhase: exercise.phase,
          exerciseStatus: exerciseState?.status ?? 'active',
          language: effectiveCoachLanguage,
          planId,
        }),
      })

      const payload = await response.json().catch(() => ({})) as {
        reply?: string
        llmLatencyMs?: number
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error ?? `Coach cue failed: ${response.status}`)
      }

      const reply = typeof payload.reply === 'string' ? payload.reply.trim() : ''
      if (!reply) {
        throw new Error('Coach cue missing')
      }

      recordVoiceDebugEvent('session-player.cue.success', {
        intent,
        currentIndex,
        llmLatencyMs: typeof payload.llmLatencyMs === 'number' ? payload.llmLatencyMs : undefined,
        ...describeVoiceDebugText(reply),
      })

      return {
        text: reply,
        source: 'dynamic',
      }
    } catch (error) {
      setCoachCueMode('local')
      if (!cueFallbackHintShownRef.current) {
        cueFallbackHintShownRef.current = true
        setVoiceHint(messages.session.liveFallback)
      }
      recordVoiceDebugEvent('session-player.cue.fallback', {
        intent,
        currentIndex,
        message: error instanceof Error ? error.message : String(error),
      })

      return {
        text: fallback,
        source: 'fallback',
      }
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  })

  useEffect(() => {
    if (!currentExercise) {
      return
    }

    const cueKey = `${effectiveCoachLanguage}:${currentIndex}:${currentExercise.name}`
    if (prefetchedCueKeyRef.current === cueKey) {
      return
    }
    prefetchedCueKeyRef.current = cueKey

    let cancelled = false
    void requestAdaptiveCue('intro', currentExercise, currentExerciseState).then(cue => {
      if (cancelled) {
        return
      }

      setCuePreviewByIndex(previous => {
        if (previous[currentIndex] === cue.text) {
          return previous
        }

        return {
          ...previous,
          [currentIndex]: cue.text,
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [currentExercise, currentIndex, effectiveCoachLanguage, requestAdaptiveCue])

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
      || activeTtsKind !== 'elevenlabs'
      || turnState !== 'idle'
      || isCueSpeaking
    ) {
      return
    }

    pendingBrowserTTSFallbackRef.current = false
    recordVoiceDebugEvent('session-player.tts.fallback-browser', {})
    setTtsKind('browser')
  }, [activeTtsKind, isCueSpeaking, turnState])

  useEffect(() => {
    if (activeTtsKind !== 'kokoro') {
      setIsTtsModelLoading(false)
    }
  }, [activeTtsKind])

  useEffect(() => {
    if (activeTtsKind !== 'kokoro' || typeof ttsProvider.prepare !== 'function') {
      return
    }

    let cancelled = false

    const warmup = () => {
      if (cancelled) {
        return
      }

      recordVoiceDebugEvent('session-player.kokoro.prewarm.start', {})
      void ttsProvider.prepare?.().then(() => {
        if (!cancelled) {
          recordVoiceDebugEvent('session-player.kokoro.prewarm.success', {})
        }
      }).catch(error => {
        if (!cancelled) {
          recordVoiceDebugEvent('session-player.kokoro.prewarm.error', {
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(() => {
        warmup()
      }, { timeout: 1500 })

      return () => {
        cancelled = true
        window.cancelIdleCallback(idleId)
      }
    }

    const timerId = globalThis.setTimeout(() => {
      warmup()
    }, 300)

    return () => {
      cancelled = true
      globalThis.clearTimeout(timerId)
    }
  }, [activeTtsKind, ttsProvider])

  useEffect(() => {
    if (isTtsModelLoading) {
      setVoiceHint(previous => previous ?? kokoroLoadingHint)
      return
    }

    setVoiceHint(previous => previous === kokoroLoadingHint ? undefined : previous)
  }, [isTtsModelLoading, kokoroLoadingHint])

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
      setVoiceHint(previous => previous ?? audioUnlockHint)
      return
    }

    if (turnState !== 'idle') {
      return
    }

    const fallbackIntro = resolveCueFallback(currentExercise, effectiveCoachLanguage)
    if (!fallbackIntro) {
      setPendingIntroIndex(null)
      return
    }

    setPendingIntroIndex(null)
    setDraftTranscript('')
    setVoiceHint(undefined)

    const cuePlaybackToken = cuePlaybackTokenRef.current + 1
    cuePlaybackTokenRef.current = cuePlaybackToken
    setIsCueSpeaking(true)
    void requestAdaptiveCue('intro', currentExercise, currentExerciseState)
      .then(intro => {
        if (cuePlaybackTokenRef.current !== cuePlaybackToken) {
          return
        }

        recordVoiceDebugEvent('session-player.intro.start', {
          currentIndex,
          source: intro.source,
          ...describeVoiceDebugText(intro.text),
        })
        setSessionTranscript(previous => {
          const last = previous[previous.length - 1]
          if (last?.role === 'assistant' && last.content === intro.text) {
            return previous
          }

          return [
            ...previous,
            {
              role: 'assistant',
              content: intro.text,
              timestamp: Date.now(),
            },
          ]
        })

        return ttsProvider.speak(intro.text)
      })
      .catch(error => {
        if (cuePlaybackTokenRef.current === cuePlaybackToken) {
          recordVoiceDebugEvent('session-player.intro.error', {
            currentIndex,
            message: error instanceof Error ? error.message : String(error),
          })
          setVoiceHint(toPlaybackHint(error, effectiveCoachLanguage))
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
  }, [currentExercise, currentExerciseState, currentIndex, effectiveCoachLanguage, pendingIntroIndex, requestAdaptiveCue, ttsProvider, turnState])

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
      || isCueSpeaking
    ) {
      stopListening()
      return
    }

    if (turnState === 'listening') {
      return
    }

    if (turnState !== 'idle') {
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
  const isMicLoopArmed = isMicEnabled && sttKind !== 'none' && workoutState.status === 'active'

  useEffect(() => {
    if (effectiveTurnState !== 'idle' || isMicLoopArmed) {
      setIsVoiceUiGraceActive(true)
      return
    }

    const timerId = window.setTimeout(() => {
      setIsVoiceUiGraceActive(false)
    }, VOICE_UI_IDLE_GRACE_MS)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [effectiveTurnState, isMicLoopArmed])

  const voiceStatusState: TurnState = effectiveTurnState === 'idle' && isMicLoopArmed
    ? 'listening'
    : effectiveTurnState
  const coachCopy = currentExercise ? excerptCoachCopy(
    [...sessionTranscript].reverse().find(message => message.role === 'assistant')?.content
      ?? cuePreviewByIndex[currentIndex]
      ?? resolveCueFallback(currentExercise, effectiveCoachLanguage),
  ) : ''
  const voiceHintClasses = voiceHint === kokoroLoadingHint
    ? 'border-white/10 bg-white/[0.06] text-white/58'
    : voiceHint === audioUnlockHint
      ? 'border-[rgba(240,160,75,0.18)] bg-[rgba(240,160,75,0.08)] text-[rgba(255,239,219,0.78)]'
      : 'border-[rgba(42,157,138,0.18)] bg-white/[0.06] text-white/68'
  const phaseColor = currentExercise ? PHASE_COLORS[currentExercise.phase] ?? 'var(--primary)' : 'var(--primary)'
  const isVoiceGlowActive = workoutState.status === 'active'
    && (voiceStatusState !== 'idle' || isVoiceUiGraceActive)

  useEffect(() => {
    if (!voiceDebugEnabled) return

    recordVoiceDebugEvent('session-player.state', {
      currentIndex,
      sessionNumber,
      sttKind,
      ttsKind: activeTtsKind,
      requestedTtsKind: ttsKind,
      turnState,
      uiTurnState: voiceStatusState,
      workoutStatus: workoutState.status,
      isMicEnabled,
      isTtsModelLoading,
      hasAudioInteraction,
      coachCueMode,
      pendingIntroIndex,
      transcriptCount: sessionTranscript.length,
      coachLanguage: effectiveCoachLanguage,
    })
  }, [
    currentIndex,
    effectiveCoachLanguage,
    hasAudioInteraction,
    coachCueMode,
    isMicEnabled,
    isTtsModelLoading,
    isVoiceUiGraceActive,
    pendingIntroIndex,
    sessionNumber,
    sessionTranscript.length,
    sttKind,
    activeTtsKind,
    ttsKind,
    turnState,
    voiceStatusState,
    voiceDebugEnabled,
    workoutState.status,
  ])

  async function handleUserTurn(message: string) {
    const trimmed = message.trim()
    if (!trimmed || !currentExercise) return

    recordVoiceDebugEvent('session-player.user-turn.submit', describeVoiceDebugText(trimmed))
    if (
      isCueSpeaking
      || turnState === 'processing'
      || turnState === 'speaking'
      || ttsProvider.isSpeaking()
    ) {
      interrupt()
    }
    setDraftTranscript('')
    setVoiceHint(undefined)

    try {
      await sendMessage(trimmed, buildTurnContext())
    } catch (error) {
      handleVoiceError(error instanceof Error ? error : new Error(
        effectiveCoachLanguage === 'en'
          ? 'Message could not be sent.'
          : 'Nachricht konnte nicht gesendet werden'
      ))
    }
  }

  async function handleRepeat() {
    if (!currentExercise) return
    recordVoiceDebugEvent('session-player.repeat', {
      currentIndex,
      ttsKind: activeTtsKind,
    })
    const preparePromise = ttsProvider.prepare?.().catch(error => {
      recordVoiceDebugEvent('session-player.repeat.prepare.error', {
        currentIndex,
        message: error instanceof Error ? error.message : String(error),
      })
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
      const cue = await requestAdaptiveCue('repeat', currentExercise, currentExerciseState)
      await preparePromise
      await ttsProvider.speak(cue.text)
      autoCueReadyRef.current = true

      setSessionTranscript(previous => [
        ...previous,
        {
          role: 'assistant',
          content: cue.text,
          timestamp: Date.now(),
        },
      ])
    } catch (error) {
      if (cuePlaybackTokenRef.current === cuePlaybackToken) {
        recordVoiceDebugEvent('session-player.repeat.error', {
          currentIndex,
          message: error instanceof Error ? error.message : String(error),
        })
        setVoiceHint(toPlaybackHint(error, effectiveCoachLanguage))
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

  function handleMicToggle() {
    if (sttKind === 'none') {
      recordVoiceDebugEvent('session-player.mic.unavailable', {})
      setVoiceHint(messages.session.voiceUnavailable)
      return
    }

    if (isMicEnabled) {
      recordVoiceDebugEvent('session-player.mic.disable', {
        sttKind,
      })
      setIsMicEnabled(false)
      stopListening()
      setDraftTranscript('')
      setVoiceHint(messages.session.micOff)
      return
    }

    recordVoiceDebugEvent('session-player.mic.enable', {
      sttKind,
    })
    setIsMicEnabled(true)
    setVoiceHint(messages.session.micOn)
  }

  if (exercises.length === 0 || !currentExercise || !currentExerciseState) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <span className="text-phase" style={{ color: 'var(--text-muted)', letterSpacing: '0.2em' }}>
          {messages.session.noExercises.toUpperCase()}
        </span>
      </div>
    )
  }

  return (
    <div
      className="session-player relative h-[100svh] max-h-[100svh] overflow-hidden"
      style={{ background: '#020303' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 42%, rgba(59, 184, 154, 0.14), transparent 24%), linear-gradient(180deg, #030404 0%, #010202 100%)',
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-[39%] h-80 w-80 -translate-x-1/2 rounded-full bg-[rgba(69,205,183,0.06)] blur-3xl" />
      <div className="session-player__shell relative z-10 mx-auto grid h-[100svh] max-h-[100svh] w-full max-w-md overflow-hidden px-4 pb-[calc(0.8rem+var(--safe-bottom))] pt-[max(0.9rem,var(--safe-top))] text-white md:px-6">
        <div className="session-player__topbar mb-[clamp(0.65rem,2vh,1rem)] flex items-center justify-between">
          <button
            onClick={handleStop}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition-colors hover:text-white"
            aria-label={effectiveCoachLanguage === 'en' ? 'End session' : 'Session beenden'}
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
          <div className="h-9 w-9" aria-hidden="true" />
        </div>

        <div className="session-player__hero flex flex-col items-center text-center">
          <div className="mb-3">
            <VoiceStatusIndicator
              state={voiceStatusState}
              className="border-white/8 bg-white/4 text-white/80"
              labels={statusLabels}
            />
          </div>

          <div className="session-player__hero-inner w-full">
            <p className="text-phase mb-2 text-center" style={{ color: phaseColor, letterSpacing: '0.32em' }}>
              {phaseLabels[currentExercise.phase] ?? currentExercise.phase}
            </p>
            <h1 className="session-player__title w-full px-2 text-center font-display text-[clamp(2.4rem,8vw,4.5rem)] uppercase leading-[0.9] tracking-[0.01em] text-white">
              {currentExercise.name}
            </h1>
          </div>
        </div>

        <div className="session-player__body">
          <VoiceGlowFrame
            state={voiceStatusState}
            active={isVoiceGlowActive}
            className="session-player__timer h-[min(14rem,24vh)] w-[min(14rem,24vh)] min-h-[9rem] min-w-[9rem]"
          >
            {currentExerciseState.type === 'timed' ? (
              <div className="relative z-10 flex flex-col items-center justify-center">
                <span className="font-display text-[clamp(4.3rem,13vh,6.6rem)] leading-[0.88] tracking-[0.01em] text-white">
                  {currentExerciseState.remainingSeconds ?? currentExercise.duration_seconds ?? 0}
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.28em] text-white/26">{messages.session.timerSeconds}</span>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col items-center justify-center">
                <span className="font-display text-[clamp(4.3rem,13vh,6.6rem)] leading-[0.88] tracking-[0.01em] text-white">
                  {currentExercise.repetitions ?? currentExerciseState.targetReps ?? 8}
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.28em] text-white/26">{messages.session.timerReps}</span>
              </div>
            )}
          </VoiceGlowFrame>

          <div className="session-player__copy-wrap flex min-h-0 w-full flex-col items-center justify-start overflow-hidden px-3">
            <p
              className="session-player__copy max-w-[18rem] text-center text-[clamp(0.95rem,3vw,1.2rem)] italic leading-[1.44] text-white/64"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              "{coachCopy}"
            </p>

            {draftTranscript && (
              <p className="session-player__hint mt-3 max-w-[18rem] px-3 text-center text-[0.72rem] leading-5 text-white/34">
                {draftTranscript}
              </p>
            )}

            {voiceHint && (
              <p className={`session-player__hint mt-3 max-w-[18.5rem] rounded-full border px-4 py-2 text-center text-[0.72rem] font-medium leading-4 ${voiceHintClasses}`}>
                {voiceHint}
              </p>
            )}
          </div>

          <div className="session-player__controls w-full pb-1 pt-[clamp(0.25rem,1vh,0.6rem)]">
            <div className="grid grid-cols-4 items-center gap-3">
              <button
                onClick={() => void handleRepeat()}
                disabled={effectiveTurnState === 'processing'}
                className="mx-auto flex h-[3.65rem] w-[3.65rem] items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.05] text-white/34 transition-colors hover:text-white disabled:opacity-50"
                aria-label={effectiveCoachLanguage === 'en' ? 'Repeat' : 'Nochmal'}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.69" />
                  <path d="M4 4v5h5" />
                </svg>
              </button>

              <button
                onClick={handleMicToggle}
                disabled={sttKind === 'none' || workoutState.status === 'paused'}
                className="mx-auto flex h-[3.65rem] w-[3.65rem] items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.05] text-white/34 transition-colors hover:text-white disabled:opacity-40"
                aria-label={isMicEnabled
                  ? (effectiveCoachLanguage === 'en' ? 'Turn microphone off' : 'Mikrofon aus')
                  : (effectiveCoachLanguage === 'en' ? 'Turn microphone on' : 'Mikrofon an')}
              >
                {isMicEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>

              <button
                onClick={handlePauseToggle}
                className="mx-auto flex h-[4.7rem] w-[4.7rem] items-center justify-center rounded-full bg-[#8FE8D9] text-white shadow-[0_0_56px_rgba(99,205,185,0.18)]"
                aria-label={workoutState.status === 'paused'
                  ? (effectiveCoachLanguage === 'en' ? 'Resume' : 'Fortsetzen')
                  : (effectiveCoachLanguage === 'en' ? 'Pause' : 'Pause')}
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
                className="mx-auto flex h-[3.65rem] w-[3.65rem] items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.05] text-white/34 transition-colors hover:text-white"
                aria-label={isLast
                  ? (effectiveCoachLanguage === 'en' ? 'Complete session' : 'Session abschließen')
                  : (effectiveCoachLanguage === 'en' ? 'Next' : 'Weiter')}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 5v14" />
                  <path d="M9 7l8 5-8 5V7z" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
