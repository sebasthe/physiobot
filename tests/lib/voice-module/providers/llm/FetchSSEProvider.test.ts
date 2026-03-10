import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FetchSSEProvider } from '@/lib/voice-module/providers/llm/FetchSSEProvider'
import type { TurnContext } from '@/lib/voice-module/core/types'

function createSseStream(chunks: string[]) {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe('FetchSSEProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses SSE stream chunks from the endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([
        'data: {"type":"delta","text":"Hallo"}\n\n',
        'data: {"type":"tool_call","name":"next_exercise","input":{}}\n\n',
        'data: {"type":"done","reply":"Hallo","llmLatencyMs":50,"totalLatencyMs":100}\n\n',
      ]),
    }))

    const provider = new FetchSSEProvider({ endpoint: '/api/voice/realtime/stream' })
    const context: TurnContext = {
      systemPrompt: 'You are a coach',
      tools: [
        {
          name: 'next_exercise',
          description: 'Advance',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      metadata: {
        currentExercise: { name: 'Squat' },
        sessionNumber: 2,
        workoutState: { status: 'active' },
      },
    }

    const chunks = []
    for await (const chunk of provider.streamTurn(context, [{ role: 'user', content: 'Weiter' }])) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { type: 'delta', text: 'Hallo' },
      { type: 'tool_call', name: 'next_exercise', input: {} },
      { type: 'done', reply: 'Hallo', llmLatencyMs: 50, totalLatencyMs: 100 },
    ])
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/voice/realtime/stream',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )
  })

  it('throws when the endpoint responds without a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    }))

    const provider = new FetchSSEProvider({ endpoint: '/api/voice/realtime/stream' })

    await expect(async () => {
      for await (const _chunk of provider.streamTurn({ systemPrompt: 'test' }, [])) {
        // no-op
      }
    }).rejects.toThrow('No response body')
  })
})
