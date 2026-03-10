import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources/messages'
import { anthropic } from '@/lib/claude/client'
import { buildDrMiaSystemPrompt } from '@/lib/claude/prompts'
import { getSessionContext, type TranscriptMessage } from '@/lib/mem0'
import type { ToolDefinition, WorkoutState } from '@/lib/voice-module/core/types'

interface VoiceOrchestratorInput {
  userId: string
  messages?: TranscriptMessage[]
  currentExercise?: { name?: string; description?: string; phase?: string }
  sessionNumber?: number
  tools?: ToolDefinition[]
  workoutState?: WorkoutState
}

interface VoiceOrchestratorResult {
  reply: string
  llmLatencyMs: number
}

interface VoiceOrchestrationPrompt {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type VoiceTurnStreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'done'; reply: string; llmLatencyMs: number }

function getPhaseHint(phase: string | undefined) {
  if (phase === 'warmup') {
    return 'Phase-Hinweis: ruhiger Einstieg, Sicherheit, Atmung, keine Überforderung.'
  }
  if (phase === 'cooldown') {
    return 'Phase-Hinweis: Tempo reduzieren, Entspannung, positives Abschlussgefühl.'
  }
  return 'Phase-Hinweis: klare Technik-Cues, kurze motivierende Korrekturen, kontrollierte Intensität.'
}

export async function runVoiceTurnOrchestration(
  supabase: any,
  input: VoiceOrchestratorInput
): Promise<VoiceOrchestratorResult> {
  const prompt = await buildVoiceOrchestrationPrompt(supabase, input)
  const llmStart = Date.now()
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: prompt.system,
    messages: prompt.messages,
    tools: mapAnthropicTools(input.tools),
  })

  const content = response.content.find(item => item.type === 'text')
  if (!content || content.type !== 'text') {
    throw new Error('No response text returned')
  }

  return {
    reply: content.text.trim(),
    llmLatencyMs: Math.max(0, Date.now() - llmStart),
  }
}

export async function* streamVoiceTurnOrchestration(
  supabase: any,
  input: VoiceOrchestratorInput
): AsyncGenerator<VoiceTurnStreamChunk> {
  const prompt = await buildVoiceOrchestrationPrompt(supabase, input)
  const llmStart = Date.now()
  const stream = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    stream: true,
    system: prompt.system,
    messages: prompt.messages,
    tools: mapAnthropicTools(input.tools),
  })

  let fullReply = ''
  let firstDeltaAt: number | null = null
  let sawToolCall = false
  let pendingToolUse: {
    name: string
    input: Record<string, unknown> | null
    partialJson: string
  } | null = null

  for await (const event of stream as any) {
    if (event?.type === 'content_block_start' && event?.content_block?.type === 'tool_use') {
      pendingToolUse = {
        name: typeof event.content_block.name === 'string' ? event.content_block.name : 'unknown_tool',
        input: isRecord(event.content_block.input) ? event.content_block.input : null,
        partialJson: '',
      }
      continue
    }

    if (event?.type === 'content_block_delta' && event?.delta?.type === 'input_json_delta' && pendingToolUse) {
      pendingToolUse.partialJson += typeof event.delta.partial_json === 'string' ? event.delta.partial_json : ''
      continue
    }

    if (event?.type === 'content_block_stop' && pendingToolUse) {
      sawToolCall = true
      yield {
        type: 'tool_call',
        name: pendingToolUse.name,
        input: parseToolInput(pendingToolUse.partialJson, pendingToolUse.input),
      }
      pendingToolUse = null
      continue
    }

    if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta') {
      const text = typeof event.delta.text === 'string' ? event.delta.text : ''
      if (!text) continue
      if (!firstDeltaAt) firstDeltaAt = Date.now()
      fullReply += text
      yield { type: 'delta', text }
    }
  }

  const reply = fullReply.trim()
  if (!reply && !sawToolCall) {
    throw new Error('No response text returned')
  }

  yield {
    type: 'done',
    reply,
    llmLatencyMs: firstDeltaAt ? Math.max(0, firstDeltaAt - llmStart) : Math.max(0, Date.now() - llmStart),
  }
}

async function buildVoiceOrchestrationPrompt(
  supabase: any,
  input: VoiceOrchestratorInput
): Promise<VoiceOrchestrationPrompt> {
  const [{ data: healthProfile }, { data: profile }, { data: streakRow }, { data: sessions }] = await Promise.all([
    supabase.from('health_profiles').select('complaints').eq('user_id', input.userId).maybeSingle(),
    supabase.from('profiles').select('name').eq('id', input.userId).maybeSingle(),
    supabase.from('streaks').select('current').eq('user_id', input.userId).maybeSingle(),
    supabase.from('sessions').select('created_at, completed_at').eq('user_id', input.userId).order('created_at', { ascending: false }).limit(1),
  ])

  const memoryContext = await getSessionContext(input.userId).catch(() => ({
    kernMotivation: null,
    personalityHints: [],
    patternHints: [],
    lifeContext: [],
  }))

  const nowHour = new Date().getHours()
  const timeOfDay = nowHour < 11 ? 'morning' : nowHour < 17 ? 'midday' : 'evening'
  const lastSession = sessions?.[0]
    ? {
        date: new Date(sessions[0].created_at).toLocaleDateString('de-DE'),
        duration: 0,
        completedAll: Boolean(sessions[0].completed_at),
      }
    : undefined

  const system = buildDrMiaSystemPrompt({
    userName: profile?.name ?? 'du',
    streak: streakRow?.current ?? 0,
    bodyAreas: healthProfile?.complaints ?? [],
    memoryContext,
    timeOfDay,
    lastSession,
    sessionNumber: input.sessionNumber ?? 1,
  })

  const contextMessage = input.currentExercise?.name
    ? `Aktuelle Übung: ${input.currentExercise.name}. Beschreibung: ${input.currentExercise.description ?? 'keine zusätzliche Beschreibung'}. Phase: ${input.currentExercise.phase ?? 'main'}. ${getPhaseHint(input.currentExercise.phase)}`
    : 'Aktuell läuft eine Physio-Session.'
  const workoutStateMessage = input.workoutState
    ? `WorkoutState: ${JSON.stringify({
        status: input.workoutState.status,
        currentExerciseIndex: input.workoutState.currentExerciseIndex,
        currentExercise: input.workoutState.exercises[input.workoutState.currentExerciseIndex] ?? null,
        exercises: input.workoutState.exercises,
      })}`
    : null

  const responseStyleMessage = 'Antwortstil: maximal 2-3 kurze Sätze, konkrete nächste Aktion, empathisch aber ohne Schreiwörter oder übertriebene Rhetorik.'

  const messages = [
    { role: 'user' as const, content: contextMessage },
    ...(workoutStateMessage ? [{ role: 'user' as const, content: workoutStateMessage }] : []),
    { role: 'user' as const, content: responseStyleMessage },
    ...((input.messages ?? []).map(message => ({
      role: message.role,
      content: message.content,
    }))),
  ]

  return { system, messages }
}

function mapAnthropicTools(tools?: ToolDefinition[]): AnthropicTool[] | undefined {
  if (!tools?.length) {
    return undefined
  }

  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as AnthropicTool['input_schema'],
  }))
}

function parseToolInput(partialJson: string, fallback: Record<string, unknown> | null): Record<string, unknown> {
  if (partialJson.trim()) {
    try {
      const parsed = JSON.parse(partialJson) as unknown
      if (isRecord(parsed)) {
        return parsed
      }
    } catch {
      return fallback ?? {}
    }
  }

  return fallback ?? {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
