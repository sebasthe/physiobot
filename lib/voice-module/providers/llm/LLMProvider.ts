import type { StreamChunk, TurnContext } from '../../core/types'

export interface LLMProvider {
  streamTurn(
    context: TurnContext,
    messages: Array<{ role: string; content: string }>,
    model?: string,
  ): AsyncGenerator<StreamChunk>
}
