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

type SessionMode = 'coach' | 'listening'

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
  const [mode, setMode] = useState<SessionMode>('coach')
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
  const [isMicModeEnabled, setIsMicModeEnabled] = useState(false)
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const realtimeOrchestratorRef = useRef<ElevenLabsRealtimeOrchestrator | null>(null)
  const listeningIdleTimerRef = useRef<number | null>(null)
  const listeningResumeTimerRef = useRef<number | null>(null)
  const pendingTurnControllerRef = useRef<AbortController | null>(null)
  const speechQueueRef = useRef<string[]>([])
  const speechQueueTaskRef = useRef<Promise<void> | null>(null)
  const autoSendTimerRef = useRef<number | null>(null)
  const pendingTranscriptRef = useRef<string | null>(null)
  const micModeEnabledRef = useRef(false)
  const userTranscriptRef = useRef('')
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
  const displayCoachCopy = useMemo(() => {
    const source = (coachTranscript || current.voice_script || '').replace(/\s+/g, ' ').trim()
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
  }, [coachTranscript, current.voice_script])

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

  const clearListeningResumeTimer = () => {
    if (listeningResumeTimerRef.current) {
      window.clearTimeout(listeningResumeTimerRef.current)
      listeningResumeTimerRef.current = null
    }
  }

  const clearSpeechQueue = () => {
    speechQueueRef.current = []
    speechQueueTaskRef.current = null
  }

  const processSpeechQueue = () => {
    if (speechQueueTaskRef.current) return speechQueueTaskRef.current
    speechQueueTaskRef.current = (async () => {
      while (speechQueueRef.current.length > 0) {
        const part = speechQueueRef.current.shift()
        if (!part) continue
        await speakWithStatus(part)
      }
    })().finally(() => {
      speechQueueTaskRef.current = null
    })
    return speechQueueTaskRef.current
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

  const scheduleListeningResume = (delayMs = 220) => {
    clearListeningResumeTimer()
    listeningResumeTimerRef.current = window.setTimeout(() => {
      listeningResumeTimerRef.current = null
      if (!micModeEnabledRef.current || isPaused || isResponding || mode === 'listening') return
      startListening()
    }, delayMs)
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
    recognitionRef.current = null
    stopRealtimeListening()
    clearListeningIdleTimer()
    clearListeningResumeTimer()
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
    const wasSpeakingOrPending = Boolean(pendingTurnControllerRef.current) || Boolean(speechQueueTaskRef.current)
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
          if (micModeEnabledRef.current && !isPaused) {
            scheduleListeningResume(220)
          }
        }
      },
      onError: message => {
        trackVoiceEvent('voice_error', { stage: 'realtime_stt', message })
        setVoiceHint(message)
        setMode('coach')
        setAgentStatus('bereit')
        stopRealtimeListening()
        if (micModeEnabledRef.current && !isPaused) {
          scheduleListeningResume(320)
        }
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
      clearListeningResumeTimer()
      pendingTranscriptRef.current = null
      clearSpeechQueue()
      stopAllListening()
    }
  }, [])

  useEffect(() => {
    micModeEnabledRef.current = isMicModeEnabled
  }, [isMicModeEnabled])

  useEffect(() => {
    if (isPaused || isResponding || mode === 'listening') return
    if (!isMicModeEnabled) {
      clearListeningResumeTimer()
      return
    }
    scheduleListeningResume(100)
  }, [isMicModeEnabled, isPaused, isResponding, mode, sttMode])

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
  }, [currentIndex, current])

  useEffect(() => {
    if (isPaused || timeLeft === null || timeLeft <= 0) return
    const timer = setTimeout(() => setTimeLeft(t => (t ?? 1) - 1), 1000)
    return () => clearTimeout(timer)
  }, [isPaused, timeLeft])

  const handleNext = () => {
    if (isLast) {
      onComplete({ transcript, completedExercises })
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  const handleRepeat = async () => {
    setMode('coach')
    setCoachTranscript(current.voice_script)
    await speakWithStatus(current.voice_script)
  }

  const handlePauseToggle = () => {
    setIsPaused(prev => {
      const next = !prev
      if (next) {
        setIsMicModeEnabled(false)
        stopAllListening()
      }
      return next
    })
  }

  const handleStop = () => {
    setIsMicModeEnabled(false)
    pendingTurnControllerRef.current?.abort()
    pendingTurnControllerRef.current = null
    clearAutoSendTimer()
    pendingTranscriptRef.current = null
    clearSpeechQueue()
    stopAllListening()
    stopSpeaking?.()
    onComplete({ transcript, completedExercises: exercises.slice(0, Math.max(1, currentIndex)) })
  }

  const startListening = () => {
    if (isPaused || isResponding) return
    if (realtimeOrchestratorRef.current?.isActive || mode === 'listening') return

    if (sttMode === 'realtime') {
      void startRealtimeListening().catch(() => {
        const Recognition = typeof window !== 'undefined'
          ? window.SpeechRecognition ?? window.webkitSpeechRecognition
          : undefined
        if (Recognition) {
          setSttMode('browser')
          setVoiceHint('Realtime-Voice nicht verfügbar. Wechsle auf Browser-Spracherkennung.')
          trackVoiceEvent('fallback_mode', { sttMode: 'browser', reason: 'realtime_failed' })
          if (micModeEnabledRef.current && !isPaused) {
            scheduleListeningResume(120)
          }
        } else {
          setSttMode('none')
          setVoiceHint('Sprachaufnahme ist hier eingeschränkt. Du kannst weiterhin tippen.')
          setIsMicModeEnabled(false)
        }
      })
      return
    }

    const Recognition = typeof window !== 'undefined'
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined
    if (!Recognition) {
      setVoiceHint('Sprachaufnahme ist auf diesem Gerät nicht verfügbar. Bitte nutze das Texteingabefeld.')
      trackVoiceEvent('fallback_mode', { sttMode: 'none', reason: 'recognition_unavailable' })
      setIsMicModeEnabled(false)
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
      recognitionRef.current = null
      trackVoiceEvent('voice_error', { stage: 'browser_stt' })
      if (micModeEnabledRef.current && !isPaused) {
        scheduleListeningResume(320)
      }
    }

    recognition.onend = () => {
      clearListeningIdleTimer()
      recognitionRef.current = null
      if (userTranscriptRef.current.trim()) {
        setMode('coach')
        setAgentStatus('versteht')
        queueCommittedTranscript(userTranscriptRef.current.trim(), 'browser')
      } else {
        setMode('coach')
        setAgentStatus('bereit')
        if (micModeEnabledRef.current && !isPaused) {
          scheduleListeningResume(220)
        }
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
      recognitionRef.current = null
      clearListeningIdleTimer()
      if (micModeEnabledRef.current && !isPaused) {
        scheduleListeningResume(600)
      }
    }
  }

  const toggleMicMode = () => {
    if (isPaused) return
    if (isMicModeEnabled) {
      micModeEnabledRef.current = false
      setIsMicModeEnabled(false)
      stopAllListening()
      setMode('coach')
      setAgentStatus('bereit')
      setVoiceHint('Mikrofon aus.')
      return
    }
    micModeEnabledRef.current = true
    setIsMicModeEnabled(true)
    setVoiceHint('Mikrofon aktiv. Ich höre kontinuierlich zu.')
    startListening()
  }

  const exitSpeakMode = () => {
    micModeEnabledRef.current = false
    setIsMicModeEnabled(false)
    stopAllListening()
    setMode('coach')
    setAgentStatus('bereit')
    setVoiceHint(undefined)
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

  const copyTranscript = async () => {
    if (transcript.length === 0) {
      setVoiceHint('Noch kein Transkript zum Kopieren.')
      return
    }
    const exportText = transcript
      .map(message => `${message.role === 'assistant' ? 'Dr. Mia' : 'Du'}: ${message.content}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(exportText)
      setVoiceHint('Transkript kopiert.')
    } catch {
      setVoiceHint('Kopieren nicht möglich. Bitte Text manuell markieren.')
    }
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
    let turnAborted = false
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
      await processSpeechQueue()
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
        turnAborted = true
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
      if (!turnAborted && micModeEnabledRef.current && !isPaused && sttMode !== 'none') {
        scheduleListeningResume(180)
      }
    }
  }

  const phaseColor = PHASE_COLORS[current.phase] ?? 'var(--primary)'
  return (
    <div
      className="session-player relative h-[100svh] max-h-[100svh] overflow-hidden"
      style={{ background: '#020303' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(59,184,154,0.14),transparent_24%),linear-gradient(180deg,#030404_0%,#010202_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[39%] h-80 w-80 -translate-x-1/2 rounded-full bg-[rgba(69,205,183,0.06)] blur-3xl" />
      <div className="session-player__divider pointer-events-none absolute inset-x-10 top-[22%] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.03),transparent)]" />
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
          <div className="h-9 w-9" />
        </div>

        <div className="session-player__hero flex flex-col items-center text-center">
          <div className="session-player__hero-inner w-full">
            <p className="text-phase mb-3 text-center" style={{ color: phaseColor, letterSpacing: '0.38em' }}>
              {PHASE_LABELS[current.phase] ?? current.phase}
            </p>
            <h1 className="session-player__title w-full px-2 text-center font-display text-[clamp(3.8rem,11vw,5.4rem)] uppercase leading-[0.9] tracking-[0.01em] text-white">
              {current.name}
            </h1>
          </div>
        </div>

        <div className="session-player__body overflow-hidden">
          <div className="session-player__timer relative flex h-[min(17.75rem,34vh)] w-[min(17.75rem,34vh)] min-h-[13.5rem] min-w-[13.5rem] items-center justify-center rounded-full border-[8px] border-[rgba(110,235,220,0.86)] shadow-[0_0_48px_rgba(66,209,192,0.12)]">
            <div className="absolute inset-5 rounded-full bg-[radial-gradient(circle,rgba(39,116,104,0.16),transparent_68%)]" />
            {totalDuration ? (
              <div className="relative z-10 flex flex-col items-center justify-center">
                <span className="font-display text-[clamp(5rem,16vh,8rem)] leading-[0.88] tracking-[0.01em] text-white">
                  {timeLeft ?? totalDuration}
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.28em] text-white/26">Sekunden</span>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col items-center justify-center">
                <span className="font-display text-[clamp(5rem,16vh,8rem)] leading-[0.88] tracking-[0.01em] text-white">
                  {current.repetitions ?? 8}
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
              "{displayCoachCopy}"
            </p>

            {voiceHint && (
              <p className="session-player__hint mt-4 max-w-[18rem] px-4 text-center text-[10px] uppercase tracking-[0.2em] text-white/22">{voiceHint}</p>
            )}
          </div>

          <div className="session-player__controls w-full pb-2 pt-[clamp(0.5rem,1.8vh,1rem)]">
            <div className="session-player__controls-grid grid grid-cols-3 items-center gap-6">
              <button
                onClick={() => void handleRepeat()}
                disabled={isResponding}
                className="mx-auto flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.05] text-white/34 transition-colors hover:text-white disabled:opacity-50"
                aria-label="Nochmal"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.69" />
                  <path d="M4 4v5h5" />
                </svg>
              </button>

              <button
                onClick={handlePauseToggle}
                disabled={isResponding}
                className="mx-auto flex h-[6.25rem] w-[6.25rem] items-center justify-center rounded-full bg-[#8FE8D9] text-white shadow-[0_0_72px_rgba(99,205,185,0.2)] disabled:opacity-50"
                aria-label={isPaused ? 'Fortsetzen' : 'Pause'}
              >
                {isPaused ? (
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
                className="mx-auto flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.05] text-white/34 transition-colors hover:text-white"
                aria-label={isLast ? 'Session abschließen' : 'Weiter'}
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
