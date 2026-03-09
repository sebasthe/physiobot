'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TranscriptMessage } from '@/lib/mem0'
import type { Exercise } from '@/lib/types'
import { ElevenLabsRealtimeOrchestrator } from '@/lib/voice/realtime-orchestrator'

interface Props {
  exercises: Exercise[]
  onComplete: (payload: { transcript: TranscriptMessage[]; completedExercises: Exercise[] }) => void
  speak: (text: string) => Promise<void>
  stopSpeaking?: () => void
  sessionId?: string
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

type AgentStatus = 'bereit' | 'hoert_zu' | 'versteht' | 'antwortet'

type VoiceTelemetryEvent =
  | 'listen_started'
  | 'transcript_committed'
  | 'agent_reply_received'
  | 'audio_started'
  | 'interrupt'
  | 'fallback_mode'
  | 'voice_error'

export default function SessionPlayer({ exercises, onComplete, speak, stopSpeaking, sessionId }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const isTestEnv = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
  const [mode, setMode] = useState<SessionMode>(isTestEnv ? 'coach' : 'pre')
  const [hasStarted, setHasStarted] = useState(isTestEnv)
  const [isPaused, setIsPaused] = useState(false)
  const [coachTranscript, setCoachTranscript] = useState('')
  const [userTranscript, setUserTranscript] = useState('')
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [isMicAvailable, setIsMicAvailable] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [typedMessage, setTypedMessage] = useState('')
  const [voiceHint, setVoiceHint] = useState<string>()
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('bereit')
  const [sttMode, setSttMode] = useState<'realtime' | 'browser' | 'none'>('none')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const realtimeOrchestratorRef = useRef<ElevenLabsRealtimeOrchestrator | null>(null)
  const listeningIdleTimerRef = useRef<number | null>(null)
  const pendingTurnControllerRef = useRef<AbortController | null>(null)
  const speechQueueRef = useRef<string[]>([])
  const speechQueueBusyRef = useRef(false)
  const autoSendTimerRef = useRef<number | null>(null)
  const pendingTranscriptRef = useRef<string | null>(null)
  const userTranscriptRef = useRef('')
  const skipAutoSpeakRef = useRef(false)
  const activeTurnStartedAtRef = useRef<number | null>(null)

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
  const progress = totalDuration && timeLeft !== null
    ? ((totalDuration - timeLeft) / totalDuration) * 100
    : null
  const estimatedExerciseSeconds = useMemo(
    () => exercises.map(ex => ex.duration_seconds ?? 45),
    [exercises]
  )
  const sessionSecondsLeft = useMemo(() => {
    const remaining = estimatedExerciseSeconds
      .slice(currentIndex + 1)
      .reduce((sum, value) => sum + value, 0)
    const currentRemaining = timeLeft ?? estimatedExerciseSeconds[currentIndex]
    return Math.max(0, currentRemaining + remaining)
  }, [currentIndex, estimatedExerciseSeconds, timeLeft])
  const ringPercent = Math.round(
    totalDuration && timeLeft !== null
      ? ((totalDuration - timeLeft) / totalDuration) * 100
      : ((currentIndex + 1) / exercises.length) * 100
  )
  const nextExercise = exercises[currentIndex + 1]
  const nextLabel = nextExercise
    ? `${nextExercise.name} · ${nextExercise.duration_seconds ? `${nextExercise.duration_seconds}s` : `${nextExercise.sets ?? 1}×${nextExercise.repetitions ?? 8}`}`
    : 'Session abschließen'

  const trackVoiceEvent = (eventType: VoiceTelemetryEvent, payload: Record<string, unknown> = {}) => {
    void fetch('/api/voice/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        sessionId,
        payload,
      }),
    }).catch(() => undefined)
  }

  const clearAutoSendTimer = () => {
    if (autoSendTimerRef.current) {
      window.clearTimeout(autoSendTimerRef.current)
      autoSendTimerRef.current = null
    }
  }

  const clearSpeechQueue = () => {
    speechQueueRef.current = []
    speechQueueBusyRef.current = false
  }

  const processSpeechQueue = async () => {
    if (speechQueueBusyRef.current) return
    speechQueueBusyRef.current = true
    try {
      while (speechQueueRef.current.length > 0) {
        const part = speechQueueRef.current.shift()
        if (!part) continue
        await speakWithStatus(part)
      }
    } finally {
      speechQueueBusyRef.current = false
    }
  }

  const enqueueSpeechChunk = (chunk: string) => {
    const trimmed = chunk.trim()
    if (!trimmed) return
    speechQueueRef.current.push(trimmed)
    void processSpeechQueue()
  }

  const clearListeningIdleTimer = () => {
    if (listeningIdleTimerRef.current) {
      window.clearTimeout(listeningIdleTimerRef.current)
      listeningIdleTimerRef.current = null
    }
  }

  const scheduleBackchannel = () => {
    clearListeningIdleTimer()
    listeningIdleTimerRef.current = window.setTimeout(() => {
      if (mode !== 'listening' || userTranscriptRef.current.trim()) return
      const backchannel = 'Ja, ich höre dich. Sprich einfach weiter.'
      setCoachTranscript(backchannel)
      setTranscript(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content === backchannel) return prev
        return [...prev, { role: 'assistant', content: backchannel }]
      })
    }, 4500)
  }

  const stopRealtimeListening = () => {
    realtimeOrchestratorRef.current?.stop()
    realtimeOrchestratorRef.current = null
    clearListeningIdleTimer()
  }

  const stopAllListening = () => {
    recognitionRef.current?.stop()
    stopRealtimeListening()
    clearListeningIdleTimer()
  }

  const speakWithStatus = async (text: string) => {
    setAgentStatus('antwortet')
    try {
      await speak(text)
    } finally {
      setAgentStatus('bereit')
    }
  }

  const interruptAgent = (reason: 'user' | 'turn_start' = 'user') => {
    const wasSpeakingOrPending = Boolean(pendingTurnControllerRef.current) || speechQueueBusyRef.current
    pendingTurnControllerRef.current?.abort()
    pendingTurnControllerRef.current = null
    clearAutoSendTimer()
    pendingTranscriptRef.current = null
    clearSpeechQueue()
    stopSpeaking?.()
    if (reason === 'user' && wasSpeakingOrPending) {
      trackVoiceEvent('interrupt', { mode })
    }
    setAgentStatus('hoert_zu')
  }

  const startRealtimeListening = async () => {
    setAgentStatus('hoert_zu')
    setMode('listening')
    setVoiceHint(undefined)
    userTranscriptRef.current = ''
    setUserTranscript('')
    interruptAgent('user')
    stopAllListening()
    activeTurnStartedAtRef.current = Date.now()
    trackVoiceEvent('listen_started', { sttMode: 'realtime', exerciseIndex: currentIndex })

    const tokenResponse = await fetch('/api/voice/tokens', { method: 'POST' })
    if (!tokenResponse.ok) {
      trackVoiceEvent('voice_error', { stage: 'token_fetch_failed' })
      throw new Error('Realtime token konnte nicht geladen werden')
    }
    const tokens = await tokenResponse.json() as { sttToken?: string }
    if (!tokens.sttToken) {
      throw new Error('Realtime token fehlt')
    }

    const orchestrator = new ElevenLabsRealtimeOrchestrator()
    realtimeOrchestratorRef.current = orchestrator
    await orchestrator.start({
      token: tokens.sttToken,
      languageCode: 'de',
      onPartialTranscript: text => {
        clearListeningIdleTimer()
        userTranscriptRef.current = text
        setUserTranscript(text || 'Ich höre zu…')
        scheduleBackchannel()
      },
      onCommittedTranscript: text => {
        clearListeningIdleTimer()
        stopRealtimeListening()
        if (text.trim()) {
          setMode('coach')
          setAgentStatus('versteht')
          queueCommittedTranscript(text.trim(), 'realtime')
        } else {
          setMode('coach')
          setAgentStatus('bereit')
        }
      },
      onError: message => {
        trackVoiceEvent('voice_error', { stage: 'realtime_stt', message })
        setVoiceHint(message)
        setMode('coach')
        setAgentStatus('bereit')
        stopRealtimeListening()
      },
    })
    scheduleBackchannel()
  }

  useEffect(() => {
    if (isTestEnv) {
      setIsMicAvailable(true)
      setSttMode('browser')
      return
    }
    const Recognition = typeof window !== 'undefined'
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined
    setIsMicAvailable(Boolean(Recognition) || typeof WebSocket !== 'undefined')

    let cancelled = false
    if (typeof window === 'undefined') return

    const detectSttMode = async () => {
      try {
        const response = await fetch('/api/voice/tokens', { method: 'POST' })
        if (!response.ok) throw new Error('No realtime token')
        if (!cancelled) setSttMode('realtime')
      } catch {
        if (!cancelled && Recognition) {
          setSttMode('browser')
          trackVoiceEvent('fallback_mode', { sttMode: 'browser' })
        } else if (!cancelled) {
          setSttMode('none')
          setVoiceHint('Sprachaufnahme ist hier eingeschränkt. Du kannst jederzeit tippen.')
          trackVoiceEvent('fallback_mode', { sttMode: 'none' })
        }
      }
    }

    void detectSttMode()

    return () => {
      cancelled = true
      pendingTurnControllerRef.current?.abort()
      pendingTurnControllerRef.current = null
      clearAutoSendTimer()
      pendingTranscriptRef.current = null
      clearSpeechQueue()
      stopAllListening()
    }
  }, [])

  useEffect(() => {
    const onAudioStart = () => {
      const startedAt = activeTurnStartedAtRef.current
      const latencyMs = startedAt ? Math.max(0, Date.now() - startedAt) : null
      trackVoiceEvent('audio_started', {
        latencyMs,
        sttMode,
      })
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('voice-audio-start', onAudioStart)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('voice-audio-start', onAudioStart)
      }
    }
  }, [sttMode])

  useEffect(() => {
    if (!hasStarted) return
    if (skipAutoSpeakRef.current) {
      skipAutoSpeakRef.current = false
      return
    }

    setMode('coach')
    setIsPaused(false)
    setVoiceHint(undefined)
    setCoachTranscript(current.voice_script)
    setTranscript(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.content === current.voice_script) return prev
      return [...prev, { role: 'assistant', content: current.voice_script }]
    })
    void speakWithStatus(current.voice_script)
    if (current.duration_seconds) {
      setTimeLeft(current.duration_seconds)
    } else {
      setTimeLeft(null)
    }
  // speak is intentionally omitted: we only re-run on index change, not when speak prop ref changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, hasStarted, current])

  useEffect(() => {
    if (!hasStarted || isPaused || timeLeft === null || timeLeft <= 0) return
    const timer = setTimeout(() => setTimeLeft(t => (t ?? 1) - 1), 1000)
    return () => clearTimeout(timer)
  }, [hasStarted, isPaused, timeLeft])

  const handleNext = () => {
    if (isLast) {
      onComplete({ transcript, completedExercises })
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  const handleRepeat = async () => {
    if (!hasStarted) return
    setMode('coach')
    setCoachTranscript(current.voice_script)
    await speakWithStatus(current.voice_script)
  }

  const handlePauseToggle = () => {
    setIsPaused(prev => {
      const next = !prev
      if (next) stopAllListening()
      return next
    })
  }

  const handleStop = () => {
    pendingTurnControllerRef.current?.abort()
    pendingTurnControllerRef.current = null
    clearAutoSendTimer()
    pendingTranscriptRef.current = null
    clearSpeechQueue()
    stopAllListening()
    stopSpeaking?.()
    onComplete({ transcript, completedExercises: exercises.slice(0, Math.max(1, currentIndex)) })
  }

  const startSession = () => {
    skipAutoSpeakRef.current = true
    setHasStarted(true)
    setMode('coach')
    setIsPaused(false)
    setVoiceHint(undefined)
    setCoachTranscript(current.voice_script)
    setTranscript(prev => [...prev, { role: 'assistant', content: current.voice_script }])
    if (current.duration_seconds) {
      setTimeLeft(current.duration_seconds)
    } else {
      setTimeLeft(null)
    }
    void speakWithStatus(current.voice_script)
  }

  const startListening = () => {
    if (realtimeOrchestratorRef.current?.isActive || mode === 'listening') {
      stopAllListening()
      setMode('coach')
      setAgentStatus('bereit')
      return
    }

    if (sttMode === 'realtime') {
      void startRealtimeListening().catch(() => {
        setSttMode('browser')
        setVoiceHint('Realtime-Voice nicht verfügbar. Wechsle auf Browser-Spracherkennung.')
        trackVoiceEvent('fallback_mode', { sttMode: 'browser', reason: 'realtime_failed' })
      })
      return
    }

    const Recognition = typeof window !== 'undefined'
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined
    if (!Recognition) {
      setVoiceHint('Sprachaufnahme ist auf diesem Gerät nicht verfügbar. Bitte nutze das Texteingabefeld.')
      trackVoiceEvent('fallback_mode', { sttMode: 'none', reason: 'recognition_unavailable' })
      return
    }

    recognitionRef.current?.stop()
    interruptAgent('user')
    activeTurnStartedAtRef.current = Date.now()
    trackVoiceEvent('listen_started', { sttMode: 'browser', exerciseIndex: currentIndex })
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
      scheduleBackchannel()
    }

    recognition.onerror = () => {
      setVoiceHint('Spracherkennung konnte nicht gestartet werden. Bitte Mikrofonzugriff in Safari erlauben oder tippen.')
      setMode('coach')
      setAgentStatus('bereit')
      clearListeningIdleTimer()
      trackVoiceEvent('voice_error', { stage: 'browser_stt' })
    }

    recognition.onend = () => {
      clearListeningIdleTimer()
      if (userTranscriptRef.current.trim()) {
        setAgentStatus('versteht')
        queueCommittedTranscript(userTranscriptRef.current.trim(), 'browser')
      } else {
        setMode('coach')
        setAgentStatus('bereit')
      }
    }

    recognitionRef.current = recognition
    userTranscriptRef.current = ''
    setUserTranscript('')
    setMode('listening')
    setAgentStatus('hoert_zu')
    setVoiceHint(undefined)
    scheduleBackchannel()
    try {
      recognition.start()
    } catch {
      setVoiceHint('Spracherkennung konnte nicht gestartet werden. Bitte tippe deine Nachricht.')
      setMode('coach')
      setAgentStatus('bereit')
      clearListeningIdleTimer()
    }
  }

  const queueCommittedTranscript = (text: string, source: 'realtime' | 'browser') => {
    const cleaned = text.trim()
    if (!cleaned) return
    pendingTranscriptRef.current = cleaned
    setTypedMessage(cleaned)
    setUserTranscript(cleaned)
    setVoiceHint('Transkript erkannt. Du kannst sofort korrigieren, sonst sende ich automatisch.')
    trackVoiceEvent('transcript_committed', { chars: cleaned.length, sttMode: source })
    clearAutoSendTimer()
    autoSendTimerRef.current = window.setTimeout(() => {
      const pending = pendingTranscriptRef.current
      pendingTranscriptRef.current = null
      autoSendTimerRef.current = null
      if (!pending) return
      setVoiceHint(undefined)
      void sendUserMessage(pending)
    }, 700)
  }

  const sendUserMessage = async (message: string) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return

    if (!activeTurnStartedAtRef.current) {
      activeTurnStartedAtRef.current = Date.now()
    }
    stopAllListening()
    interruptAgent('turn_start')
    setIsResponding(true)
    setAgentStatus('versteht')
    setIsPaused(false)
    setVoiceHint(undefined)
    setUserTranscript(trimmedMessage)
    setTypedMessage('')
    pendingTranscriptRef.current = null
    clearAutoSendTimer()
    const messages = [...transcript, { role: 'user' as const, content: trimmedMessage }]
    setTranscript(messages)
    try {
      const controller = new AbortController()
      pendingTurnControllerRef.current?.abort()
      pendingTurnControllerRef.current = controller

      const response = await fetch('/api/voice/realtime/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages,
          currentExercise: current,
        }),
      })
      if (!response.ok) throw new Error('Realtime turn failed')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No stream body')
      const decoder = new TextDecoder()

      let streamBuffer = ''
      let assistantReply = ''
      let unsentSpeechBuffer = ''
      let gotDone = false
      let llmLatencyMsFromServer: number | null = null
      let totalLatencyMsFromServer: number | null = null

      const flushSpeechBuffer = (force: boolean) => {
        const parts = unsentSpeechBuffer.split(/(?<=[.!?…])\s+/)
        const emit = force ? parts : parts.slice(0, -1)
        for (const part of emit) {
          if (part.trim()) enqueueSpeechChunk(part)
        }
        unsentSpeechBuffer = force ? '' : (parts[parts.length - 1] ?? '')
      }

      const handleSseEvent = (rawEvent: string) => {
        const dataLines = rawEvent
          .split('\n')
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trim())
        if (dataLines.length === 0) return
        let payload: { type?: string; text?: string; reply?: string; llmLatencyMs?: number; totalLatencyMs?: number } | null = null
        try {
          payload = JSON.parse(dataLines.join('\n')) as { type?: string; text?: string; reply?: string; llmLatencyMs?: number; totalLatencyMs?: number }
        } catch {
          return
        }
        if (!payload?.type) return

        if (payload.type === 'delta' && payload.text) {
          assistantReply += payload.text
          unsentSpeechBuffer += payload.text
          setCoachTranscript(assistantReply)
          setMode('coach')
          flushSpeechBuffer(false)
          return
        }

        if (payload.type === 'done') {
          const reply = payload.reply?.trim() || assistantReply.trim()
          if (reply) {
            assistantReply = reply
            setCoachTranscript(reply)
          }
          llmLatencyMsFromServer = typeof payload.llmLatencyMs === 'number' ? payload.llmLatencyMs : null
          totalLatencyMsFromServer = typeof payload.totalLatencyMs === 'number' ? payload.totalLatencyMs : null
          flushSpeechBuffer(true)
          gotDone = true
          return
        }

        if (payload.type === 'error') {
          throw new Error('Realtime stream error')
        }
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        streamBuffer += decoder.decode(value, { stream: true })
        while (true) {
          const separatorIndex = streamBuffer.indexOf('\n\n')
          if (separatorIndex === -1) break
          const rawEvent = streamBuffer.slice(0, separatorIndex)
          streamBuffer = streamBuffer.slice(separatorIndex + 2)
          handleSseEvent(rawEvent)
        }
      }

      if (streamBuffer.trim()) {
        handleSseEvent(streamBuffer)
      }

      const finalReply = assistantReply.trim() || 'Okay, wir machen es einfacher. Langsam und ohne Druck.'
      if (!gotDone) {
        flushSpeechBuffer(true)
      }
      trackVoiceEvent('agent_reply_received', {
        llmLatencyMs: llmLatencyMsFromServer ?? Math.max(0, Date.now() - (activeTurnStartedAtRef.current ?? Date.now())),
        totalLatencyMs: totalLatencyMsFromServer,
        chars: finalReply.length,
      })
      setCoachTranscript(finalReply)
      setTranscript(prev => [...prev, { role: 'assistant', content: finalReply }])
      setMode('coach')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setIsResponding(false)
        return
      }
      trackVoiceEvent('voice_error', { stage: 'assistant_reply' })
      const fallback = 'Ich bin da. Lass uns die Bewegung langsam und ruhig zusammen machen.'
      setCoachTranscript(fallback)
      setTranscript(prev => [...prev, { role: 'assistant', content: fallback }])
      setMode('coach')
      await speakWithStatus(fallback)
    } finally {
      pendingTurnControllerRef.current = null
      setIsResponding(false)
      activeTurnStartedAtRef.current = null
      if (mode !== 'listening') {
        setAgentStatus('bereit')
      }
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
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-7 text-center text-white">
            <div className="relative z-10 mb-7 flex h-[26rem] w-[26rem] items-center justify-center">
              <div
                className="absolute left-1/2 top-1/2 h-[16rem] w-[16rem] rounded-full border border-[rgba(59,184,154,0.22)]"
                style={{ animation: 'ringPulseCentered 3s ease-in-out infinite both' }}
              />
              <div
                className="absolute left-1/2 top-1/2 h-[21rem] w-[21rem] rounded-full border border-[rgba(59,184,154,0.17)]"
                style={{ animation: 'ringPulseCentered 3s ease-in-out infinite both', animationDelay: '0.6s' }}
              />
              <div
                className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] rounded-full border border-[rgba(59,184,154,0.12)]"
                style={{ animation: 'ringPulseCentered 3s ease-in-out infinite both', animationDelay: '1.2s' }}
              />
              <div className="relative flex h-[8.125rem] w-[8.125rem] items-center justify-center rounded-full text-6xl" style={{ background: 'linear-gradient(135deg,#1D7A6A,#3BB89A)', boxShadow: '0 0 60px rgba(59,184,154,0.3)' }}>
                🩺
              </div>
            </div>
            <p className="text-phase mb-3 text-[var(--teal-light)]">Dr. Mia ist bereit</p>
            <h1 className="font-display text-[2rem] leading-[1.2] text-white">
              Guten Morgen,<br />
              <em>du.</em><br />
              Heute geht&apos;s los.
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
              aria-label="Session starten"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-[1px]" fill="currentColor" aria-hidden="true">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </button>
            <p className="mt-3 text-sm text-white/45">Tippen zum Starten, dann Handy weglegen</p>
          </div>
        ) : (
          <>
        <div
          className="px-6 pb-7 pt-[max(1rem,var(--safe-top))] text-white"
          style={{
            background: mode === 'listening'
              ? 'linear-gradient(180deg, #1A0E0A 0%, #1A1209 100%)'
              : 'linear-gradient(180deg, #0A1714 0%, #0F1F1C 100%)',
          }}
        >
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
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
              {String(Math.floor(sessionSecondsLeft / 60)).padStart(2, '0')}:{String(sessionSecondsLeft % 60).padStart(2, '0')}
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">Live-Status</span>
            <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-semibold text-white/85">
              {agentStatus === 'hoert_zu' && 'Hört zu'}
              {agentStatus === 'versteht' && 'Versteht…'}
              {agentStatus === 'antwortet' && 'Antwortet…'}
              {agentStatus === 'bereit' && 'Bereit'}
            </span>
          </div>

          <div className="relative mb-4 flex justify-center">
            <div className="relative h-24 w-24">
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 rounded-full border-2"
                style={{
                  borderColor: mode === 'listening' ? 'var(--peach)' : 'var(--teal-mid)',
                  animation: 'waveOutCentered 1.8s ease-out infinite',
                  animationDelay: '0s',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 rounded-full border-2"
                style={{
                  borderColor: mode === 'listening' ? 'var(--peach)' : 'var(--teal-mid)',
                  animation: 'waveOutCentered 1.8s ease-out infinite',
                  animationDelay: '0.6s',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 rounded-full border-2"
                style={{
                  borderColor: mode === 'listening' ? 'var(--peach)' : 'var(--teal-mid)',
                  animation: 'waveOutCentered 1.8s ease-out infinite',
                  animationDelay: '1.2s',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <div
                className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full text-5xl"
                style={{
                  background: mode === 'listening'
                    ? 'linear-gradient(135deg,#7B1F10,#F0724A,#F5A26A)'
                    : 'linear-gradient(135deg,#1D7A6A,#3BB89A,#6FD4C0)',
                  animation: 'floatBob 4s ease-in-out infinite',
                  boxShadow: mode === 'listening'
                    ? '0 0 40px rgba(240,114,74,0.45)'
                    : '0 0 40px rgba(59,184,154,0.4)',
                }}
              >
                🩺
              </div>
            </div>
          </div>

          {mode === 'listening' ? (
            <>
              <div className="mb-4 flex items-center justify-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[var(--peach)] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-[rgba(240,114,74,0.9)]">Dr. Mia hört zu</span>
              </div>
              <div className="rounded-2xl border border-[rgba(240,114,74,0.2)] bg-[rgba(240,114,74,0.08)] p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[rgba(240,114,74,0.65)]">Du sagst</p>
                <p className="text-[15px] leading-7 text-white/90">
                  {userTranscript || 'Ich höre zu…'}
                </p>
              </div>
              <div className="mb-3 mt-3 flex h-10 items-end justify-center gap-[3px]">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div
                    key={index}
                    className="w-[3px] rounded bg-[var(--peach)]"
                    style={{
                      height: `${[8, 20, 14, 28, 10, 24, 16, 30, 12, 22, 8, 18][index]}px`,
                      animation: `pulse-glow ${0.35 + (index % 3) * 0.1}s ease-in-out ${index * 0.08}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
              <div className="rounded-xl border border-white/8 bg-white/4 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[rgba(168,240,224,0.4)]">Dr. Mia sagte</p>
                <p className="text-sm italic text-white/55">„{coachTranscript || current.voice_script}"</p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[rgba(168,240,224,0.6)]">Dr. Mia spricht</p>
                <p className="min-h-12 text-[15px] leading-7 text-white/90 italic">
                  {coachTranscript || current.voice_script}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div
                  className="flex min-h-[2.75rem] flex-1 items-center gap-2 rounded-full border px-3"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <input
                    value={typedMessage}
                    onChange={event => {
                      const next = event.target.value
                      setTypedMessage(next)
                      if (pendingTranscriptRef.current !== null) {
                        pendingTranscriptRef.current = null
                        clearAutoSendTimer()
                        setVoiceHint('Auto-Senden pausiert. Prüfe den Text und sende manuell.')
                      }
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void sendUserMessage(typedMessage)
                      }
                    }}
                    placeholder="Sag etwas oder tippe hier…"
                    className="voice-input h-10 flex-1 text-sm focus:outline-none"
                    aria-label="Nachricht an Dr. Mia"
                    style={{
                      background: 'transparent',
                      color: 'white',
                      border: '0',
                      boxShadow: 'none',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      padding: 0,
                    }}
                  />
                  <div className="flex items-center gap-[2px]">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="w-[2px] rounded-full"
                        style={{
                          height: `${[4, 10, 7, 12, 5][index]}px`,
                          background: 'rgba(255,255,255,0.22)',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={startListening}
                  disabled={isResponding || isPaused}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-50"
                  style={{
                    background: isMicAvailable ? 'var(--peach)' : 'rgba(255,255,255,0.18)',
                    boxShadow: isMicAvailable ? '0 4px 12px rgba(240,114,74,0.35)' : 'none',
                  }}
                  aria-label="Mit Dr. Mia sprechen"
                  title={sttMode === 'realtime' ? 'Realtime Voice aktiv' : 'Browser-Spracherkennung'}
                >
                  🎙
                </button>
                <button
                  onClick={() => {
                    pendingTranscriptRef.current = null
                    clearAutoSendTimer()
                    void sendUserMessage(typedMessage)
                  }}
                  disabled={isResponding || isPaused || !typedMessage.trim()}
                  className="rounded-full border px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'rgba(29,122,106,0.35)', borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  Senden
                </button>
              </div>
              {voiceHint && (
                <p className="mt-2 px-2 text-xs text-white/55">{voiceHint}</p>
              )}
              <p className="mt-1 px-2 text-[10px] uppercase tracking-[0.08em] text-white/40">
                Voice-Modus: {sttMode === 'realtime' ? 'Realtime' : sttMode === 'browser' ? 'Browser' : 'Text'}
              </p>
              <div className="mt-2 rounded-xl border border-white/8 bg-white/4 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[rgba(168,240,224,0.5)]">Live-Transkript</p>
                <div className="max-h-28 space-y-1.5 overflow-y-auto pr-1">
                  {transcript.slice(-4).map((message, index) => (
                    <div key={`${message.role}-${index}-${message.content.slice(0, 12)}`} className="text-xs leading-5 text-white/80">
                      <span className="font-semibold text-white/60">{message.role === 'assistant' ? 'Dr. Mia:' : 'Du:'}</span>{' '}
                      {message.content}
                      {message.role === 'user' && (
                        <button
                          onClick={() => setTypedMessage(message.content)}
                          className="ml-2 text-[10px] font-semibold text-[var(--teal-light)]"
                        >
                          bearbeiten
                        </button>
                      )}
                    </div>
                  ))}
                  {transcript.length === 0 && (
                    <div className="text-xs text-white/45">Noch kein Gespräch. Starte mit Sprache oder Text.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-auto rounded-t-[28px] bg-[var(--background)] px-6 pb-[calc(1.25rem+var(--safe-bottom))] pt-5 shadow-[0_-8px_32px_rgba(0,0,0,0.3)]">
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--border)]" />

          {isResponding && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[rgba(240,114,74,0.15)] bg-[var(--peach-light)] p-3">
              <span className="text-xl">🩺</span>
              <div>
                <div className="text-xs font-bold text-[var(--peach)]">Dr. Mia antwortet gleich…</div>
                <div className="text-xs text-[var(--text-muted)]">Verarbeite deine Frage</div>
              </div>
              <div className="ml-auto flex gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--peach)] animate-bounce [animation-delay:0ms]" />
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--peach)] animate-bounce [animation-delay:120ms]" />
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--peach)] animate-bounce [animation-delay:220ms]" />
              </div>
            </div>
          )}

          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--teal)]">
            {isPaused ? 'Pausiert' : 'Jetzt'} · Übung {currentIndex + 1} von {exercises.length}
          </p>
          <h2 className="font-display text-[1.65rem] leading-tight text-[var(--text-primary)]">{current.name}</h2>
          <p className="mb-4 mt-2 rounded-[12px] bg-[var(--sand)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
            {current.description}
          </p>

          <div className="mb-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-[12px] border p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]" style={{ borderColor: timeLeft !== null ? 'var(--teal)' : 'var(--border)', background: timeLeft !== null ? 'rgba(29,122,106,0.04)' : 'var(--card)' }}>
              <div className="text-[1.6rem] font-extrabold leading-none text-[var(--teal)] tabular-nums">{timeLeft ?? (current.duration_seconds ?? 0)}</div>
              <div className="mt-1 text-[11px] font-semibold text-[var(--text-muted)]">Sekunden</div>
            </div>
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="text-[1.6rem] font-extrabold leading-none text-[var(--text-primary)]">
                {current.sets && current.repetitions ? `${current.sets}×${current.repetitions}` : '1×8'}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-[var(--text-muted)]">Wiederholungen</div>
            </div>
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="text-[1.6rem] font-extrabold leading-none text-[var(--text-primary)]">
                {current.duration_seconds ? `${current.duration_seconds}s` : '45s'}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-[var(--text-muted)]">Gesamt</div>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-center gap-4">
            <div className="relative flex h-[88px] w-[88px] items-center justify-center">
              <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="44" cy="44" r="38" fill="none" stroke="var(--border)" strokeWidth="6" />
                <circle
                  cx="44"
                  cy="44"
                  r="38"
                  fill="none"
                  stroke={phaseColor}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={238.8}
                  strokeDashoffset={238.8 - (238.8 * ringPercent) / 100}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-extrabold text-[var(--teal)]">{ringPercent}%</span>
                <span className="text-[11px] text-[var(--text-muted)]">erledigt</span>
              </div>
            </div>
            <div className="flex-1 rounded-[12px] bg-[var(--sand)] px-4 py-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Als nächstes</div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">{nextLabel}</div>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <button
              onClick={() => void handleRepeat()}
              disabled={isResponding}
              className="rounded-[12px] border border-[var(--border)] bg-[var(--sand)] px-3 py-3 text-sm font-semibold text-[var(--text-secondary)] disabled:opacity-50"
            >
              Nochmal
            </button>
            <button
              onClick={handlePauseToggle}
              disabled={isResponding}
              className="rounded-[12px] border px-3 py-3 text-sm font-semibold disabled:opacity-50"
              style={{
                borderColor: isPaused ? 'var(--teal)' : 'var(--border)',
                color: isPaused ? 'var(--teal)' : 'var(--text-secondary)',
                background: isPaused ? 'rgba(29,122,106,0.05)' : 'var(--sand)',
              }}
            >
              {isPaused ? 'Fortsetzen' : 'Pause'}
            </button>
            <button
              onClick={handleStop}
              className="rounded-[12px] border border-[rgba(240,114,74,0.2)] bg-[rgba(240,114,74,0.05)] px-3 py-3 text-sm font-semibold text-[var(--peach)]"
            >
              Stop
            </button>
          </div>

          <button onClick={handleNext} className="btn-primary w-full rounded-[14px] py-3.5 text-lg">
            {isLast ? 'Session abschließen' : 'Weiter'}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  )
}
