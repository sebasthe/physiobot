// Knowledge RAG — Physiotherapy domain knowledge retrieval
// Status: PLACEHOLDER — table exists in DB, not yet populated
// To activate:
//   1. Populate knowledge_chunks table with physio content
//   2. Call getRelevantKnowledge() in lib/claude/prompts.ts buildSystemPrompt()

export async function getRelevantKnowledge(
  _query: string
): Promise<string[]> {
  // TODO: implement Supabase pgvector similarity search against knowledge_chunks
  // const supabase = createClient()
  // const embedding = await generateEmbedding(query)
  // const { data } = await supabase.rpc('match_knowledge', { query_embedding: embedding, match_count: 5 })
  // return data?.map(d => d.content) ?? []
  return []
}
