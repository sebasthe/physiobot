import MemoryClient from 'mem0ai'
import { NextResponse } from 'next/server'
import { classifyMemory } from '@/lib/privacy/classifier'
import { DataClass, isValidDataClass } from '@/lib/privacy/types'
import { createClient } from '@/lib/supabase/server'

interface MemoryRecord {
  id: string
  memory: string
  created_at?: string
  metadata?: Record<string, unknown> | null
}

interface Mem0Client {
  getAll: (options: { user_id: string }) => Promise<MemoryRecord[]>
  deleteAll: (options: { user_id: string }) => Promise<unknown>
}

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
}) as unknown as Mem0Client

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const memories = await mem0.getAll({ user_id: user.id }).catch(() => [])
  const formatted = memories.map(memory => ({
    id: memory.id,
    content: memory.memory,
    category: typeof memory.metadata?.category === 'string' ? memory.metadata.category : null,
    dataClass: resolveMemoryDataClass(memory),
    createdAt: memory.created_at ?? null,
  }))

  return NextResponse.json({ memories: formatted })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await mem0.deleteAll({ user_id: user.id }).catch(() => undefined)
  return NextResponse.json({ success: true })
}

function resolveMemoryDataClass(memory: MemoryRecord): DataClass {
  const metadataDataClass = memory.metadata?.data_class
  if (isValidDataClass(metadataDataClass)) {
    return metadataDataClass
  }

  const category = typeof memory.metadata?.category === 'string'
    ? memory.metadata.category
    : 'training_patterns'

  return classifyMemory(category, memory.memory)
}
