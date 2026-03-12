'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { VoiceSession } from '../core/VoiceSession'
import type { TranscriptMessage, TurnContext, TurnState, VoiceConfig } from '../core/types'
import type { LLMProvider } from '../providers/llm/LLMProvider'
import type { STTProvider } from '../providers/stt/STTProvider'
import type { TTSProvider } from '../providers/tts/TTSProvider'

interface UseVoiceSessionConfig {
  config: VoiceConfig
  stt: STTProvider
  tts: TTSProvider
  llm: LLMProvider
  onToolCall?: (tool: { name: string; input: Record<string, unknown> }) => void
  onPartialTranscript?: (text: string) => void
  onCommittedTranscript?: (text: string) => void
  onError?: (error: Error) => void
}

interface UseVoiceSessionReturn {
  turnState: TurnState
  transcript: TranscriptMessage[]
  sendMessage: (text: string, context: TurnContext) => Promise<string>
  startListening: () => Promise<void>
  stopListening: () => void
  interrupt: () => void
}

export function useVoiceSession({
  config,
  stt,
  tts,
  llm,
  onToolCall,
  onPartialTranscript,
  onCommittedTranscript,
  onError,
}: UseVoiceSessionConfig): UseVoiceSessionReturn {
  const sessionRef = useRef<VoiceSession | null>(null)
  const [turnState, setTurnState] = useState<TurnState>('idle')
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])

  const handleToolCall = useEffectEvent((tool: { name: string; input: Record<string, unknown> }) => {
    onToolCall?.(tool)
  })

  const handlePartialTranscript = useEffectEvent((text: string) => {
    onPartialTranscript?.(text)
  })

  const handleCommittedTranscript = useEffectEvent((text: string) => {
    onCommittedTranscript?.(text)
  })

  const handleError = useEffectEvent((error: Error) => {
    onError?.(error)
  })

  useEffect(() => {
    const session = new VoiceSession({ config, stt, tts, llm })
    sessionRef.current = session

    session.on('turnStateChanged', state => {
      setTurnState(state)
    })

    session.on('transcript', message => {
      setTranscript(previous => [...previous, message])
    })

    session.on('toolCall', tool => {
      handleToolCall(tool)
    })

    session.on('partialTranscript', text => {
      handlePartialTranscript(text)
    })

    session.on('committedTranscript', text => {
      handleCommittedTranscript(text)
    })

    session.on('error', error => {
      handleError(error)
    })

    return () => {
      session.destroy()
      sessionRef.current = null
    }
  }, [config, stt, tts, llm])

  async function sendMessage(text: string, context: TurnContext): Promise<string> {
    if (!sessionRef.current) {
      throw new Error('VoiceSession not initialized')
    }

    return sessionRef.current.sendMessage(text, context)
  }

  async function startListening(): Promise<void> {
    await sessionRef.current?.startListening()
  }

  function stopListening(): void {
    sessionRef.current?.stopListening()
  }

  function interrupt(): void {
    sessionRef.current?.interrupt()
  }

  return {
    turnState,
    transcript,
    sendMessage,
    startListening,
    stopListening,
    interrupt,
  }
}
