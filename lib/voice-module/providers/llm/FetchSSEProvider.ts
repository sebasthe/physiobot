import type { StreamChunk, TurnContext, WorkoutState } from '../../core/types'
import { recordVoiceDebugEvent } from '@/lib/voice-debug/client'
import type { LLMProvider } from './LLMProvider'

interface FetchSSEProviderConfig {
  endpoint: string
}

export class FetchSSEProvider implements LLMProvider {
  constructor(private config: FetchSSEProviderConfig) {}

  async *streamTurn(
    context: TurnContext,
    messages: Array<{ role: string; content: string }>,
  ): AsyncGenerator<StreamChunk> {
    const currentExercise = asRecord(context.metadata?.currentExercise)
    const workoutState = asWorkoutState(context.metadata?.workoutState)
    const currentExerciseState = workoutState
      ? workoutState.exercises[workoutState.currentExerciseIndex]
      : null

    recordVoiceDebugEvent('llm.fetch-sse.request', {
      endpoint: this.config.endpoint,
      messageCount: messages.length,
      toolCount: context.tools?.length ?? 0,
      currentExercise: currentExercise?.name ?? null,
    })

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        messages,
        currentExercise: context.metadata?.currentExercise ?? null,
        sessionNumber: context.metadata?.sessionNumber ?? 1,
        exercisePhase: resolveExercisePhase(currentExercise?.phase, currentExerciseState?.phase),
        exerciseStatus: currentExerciseState?.status,
        tools: context.tools ?? [],
        workoutState: context.metadata?.workoutState ?? null,
      }),
    })

    recordVoiceDebugEvent('llm.fetch-sse.response', {
      endpoint: this.config.endpoint,
      status: response.status,
      ok: response.ok,
      contentType: response.headers?.get?.('content-type') ?? '',
    })

    if (!response.ok) {
      recordVoiceDebugEvent('llm.fetch-sse.error', {
        endpoint: this.config.endpoint,
        status: response.status,
      })
      throw new Error(`LLM request failed: ${response.status}`)
    }

    if (!response.body) {
      recordVoiceDebugEvent('llm.fetch-sse.error', {
        endpoint: this.config.endpoint,
        status: response.status,
        message: 'No response body',
      })
      throw new Error('No response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        const payload = parseSseData(event)
        if (payload) {
          recordVoiceDebugEvent('llm.fetch-sse.chunk', describeChunk(payload))
          yield payload
        } else if (event.trim()) {
          recordVoiceDebugEvent('llm.fetch-sse.chunk-ignored', {
            size: event.length,
          })
        }
      }
    }

    if (buffer.trim()) {
      const payload = parseSseData(buffer)
      if (payload) {
        recordVoiceDebugEvent('llm.fetch-sse.chunk', describeChunk(payload))
        yield payload
      } else {
        recordVoiceDebugEvent('llm.fetch-sse.chunk-ignored', {
          size: buffer.length,
        })
      }
    }
  }
}

function describeChunk(chunk: StreamChunk): Record<string, unknown> {
  if (chunk.type === 'delta') {
    return {
      type: chunk.type,
      textLength: chunk.text.length,
    }
  }

  if (chunk.type === 'tool_call') {
    return {
      type: chunk.type,
      name: chunk.name,
    }
  }

  return {
    type: chunk.type,
    replyLength: chunk.reply.length,
    llmLatencyMs: chunk.llmLatencyMs,
    totalLatencyMs: chunk.totalLatencyMs,
  }
}

function parseSseData(rawEvent: string): StreamChunk | null {
  const data = rawEvent
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .join('\n')

  if (!data || data === '[DONE]') {
    return null
  }

  try {
    return JSON.parse(data) as StreamChunk
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asWorkoutState(value: unknown): WorkoutState | null {
  return asRecord(value) ? value as WorkoutState : null
}

function resolveExercisePhase(
  currentExercisePhase: unknown,
  currentExerciseStatePhase: unknown,
): 'warmup' | 'main' | 'cooldown' | undefined {
  if (currentExercisePhase === 'warmup' || currentExercisePhase === 'main' || currentExercisePhase === 'cooldown') {
    return currentExercisePhase
  }

  if (currentExerciseStatePhase === 'warmup' || currentExerciseStatePhase === 'main' || currentExerciseStatePhase === 'cooldown') {
    return currentExerciseStatePhase
  }

  return undefined
}
