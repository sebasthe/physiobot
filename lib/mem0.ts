import MemoryClient from 'mem0ai'

// Mem0 uses Supabase pgvector as backend — configure via environment
const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
})

// If using self-hosted Mem0 with Supabase:
// const mem0 = new MemoryClient({
//   vector_store: {
//     provider: 'supabase',
//     config: {
//       connection_string: process.env.SUPABASE_DB_URL,
//       collection_name: 'user_memories',
//     }
//   }
// })

export async function addMemory(userId: string, content: string): Promise<void> {
  await mem0.add([{ role: 'user', content }], { user_id: userId })
}

export async function getRelevantMemories(userId: string, query: string): Promise<string[]> {
  const results = await mem0.search(query, { user_id: userId, limit: 8 })
  return results.map((r: { memory?: string }) => r.memory ?? '').filter(Boolean)
}

export async function extractAndStoreMemories(
  userId: string,
  sessionSummary: string
): Promise<void> {
  await addMemory(userId, sessionSummary)
}
