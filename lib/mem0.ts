import MemoryClient from 'mem0ai'

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
})

type Role = 'user' | 'assistant'

export interface TranscriptMessage {
  role: Role
  content: string
}

export interface SessionMemoryContext {
  kernMotivation: string | null
  personalityHints: string[]
  patternHints: string[]
  lifeContext: string[]
}

export async function addMemory(userId: string, content: string): Promise<void> {
  await mem0.add([{ role: 'user', content }], { user_id: userId })
}

export async function addSessionTranscript(
  userId: string,
  messages: TranscriptMessage[],
  sessionId?: string
): Promise<void> {
  if (messages.length === 0) return

  await mem0.add(messages, {
    user_id: userId,
    metadata: {
      sessionId,
      date: new Date().toISOString(),
      type: 'session_transcript',
    },
  })
}

export async function storeKernMotivation(userId: string, motivation: string): Promise<void> {
  await mem0.add([{ role: 'user', content: motivation }], {
    user_id: userId,
    metadata: {
      category: 'motivation',
      immutable: true,
      source: 'five_whys',
    },
  })
}

export async function getRelevantMemories(userId: string, query: string): Promise<string[]> {
  const results = await mem0.search(query, { user_id: userId, limit: 8 })
  return results.map((r: { memory?: string }) => r.memory ?? '').filter(Boolean)
}

export async function getSessionContext(userId: string): Promise<SessionMemoryContext> {
  const [motivation, personality, patterns, life] = await Promise.all([
    mem0.search('core motivation reason for physio treatment family energy why', {
      user_id: userId,
      limit: 1,
    }),
    mem0.search('personality communication style reaction to praise humor tone', {
      user_id: userId,
      limit: 3,
    }),
    mem0.search('training patterns best time triggers consistency dropout', {
      user_id: userId,
      limit: 3,
    }),
    mem0.search('family job hobbies daily routine home stress context', {
      user_id: userId,
      limit: 3,
    }),
  ])

  const getMemories = (results: Array<{ memory?: string }>) =>
    results.map(result => result.memory ?? '').filter(Boolean)

  return {
    kernMotivation: motivation[0]?.memory ?? null,
    personalityHints: getMemories(personality),
    patternHints: getMemories(patterns),
    lifeContext: getMemories(life),
  }
}

export async function extractAndStoreMemories(
  userId: string,
  sessionSummary: string
): Promise<void> {
  await addMemory(userId, sessionSummary)
}
