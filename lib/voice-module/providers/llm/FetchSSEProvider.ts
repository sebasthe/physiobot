import type { StreamChunk, TurnContext } from '../../core/types'
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
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        messages,
        currentExercise: context.metadata?.currentExercise ?? null,
        sessionNumber: context.metadata?.sessionNumber ?? 1,
        tools: context.tools ?? [],
        workoutState: context.metadata?.workoutState ?? null,
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`)
    }

    if (!response.body) {
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
          yield payload
        }
      }
    }

    if (buffer.trim()) {
      const payload = parseSseData(buffer)
      if (payload) {
        yield payload
      }
    }
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
