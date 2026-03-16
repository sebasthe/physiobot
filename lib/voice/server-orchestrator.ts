import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources/messages'
import { anthropic } from '@/lib/claude/client'
import { buildDrMiaSystemPrompt } from '@/lib/claude/prompts'
import { buildCoachPolicyPrompt } from '@/lib/coach/policy-prompts'
import { getModelForMode, selectCoachMode, shouldProbeMotivation } from '@/lib/coach/mode-selector'
import type { CoachMode, CoachingMemorySnapshot, ModeContext } from '@/lib/coach/types'
import { MemoryResolver } from '@/lib/memory/resolver'
import type { SessionMemoryContext, TranscriptMessage } from '@/lib/mem0'
import type { Language, UserPersonality } from '@/lib/types'
import type { ToolDefinition, WorkoutState } from '@/lib/voice-module/core/types'

interface VoiceOrchestratorInput {
  userId: string
  messages?: TranscriptMessage[]
  currentExercise?: { name?: string; description?: string; phase?: string }
  sessionNumber?: number
  exercisePhase?: ModeContext['exercisePhase']
  exerciseStatus?: ModeContext['exerciseStatus']
  tools?: ToolDefinition[]
  workoutState?: WorkoutState
  language?: Language
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

const memoryResolver = new MemoryResolver()

function getPhaseHint(phase: string | undefined, language: Language) {
  if (language === 'en') {
    if (phase === 'warmup') {
      return 'Phase hint: gentle start, safety, breathing, no overload.'
    }
    if (phase === 'cooldown') {
      return 'Phase hint: reduce pace, relax, and finish with a positive feeling.'
    }
    return 'Phase hint: clear technique cues, short motivating corrections, controlled intensity.'
  }

  if (phase === 'warmup') {
    return 'Phase-Hinweis: ruhiger Einstieg, Sicherheit, Atmung, keine Ueberforderung.'
  }
  if (phase === 'cooldown') {
    return 'Phase-Hinweis: Tempo reduzieren, Entspannung, positives Abschlussgefuehl.'
  }
  return 'Phase-Hinweis: klare Technik-Cues, kurze motivierende Korrekturen, kontrollierte Intensitaet.'
}

export async function runVoiceTurnOrchestration(
  supabase: any,
  input: VoiceOrchestratorInput,
): Promise<VoiceOrchestratorResult> {
  const coachTurn = await resolveCoachTurn(input)
  const prompt = await buildVoiceOrchestrationPrompt(supabase, input, coachTurn)
  const llmStart = Date.now()
  const response = await anthropic.messages.create({
    model: coachTurn.model,
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
  input: VoiceOrchestratorInput,
): AsyncGenerator<VoiceTurnStreamChunk> {
  const coachTurn = await resolveCoachTurn(input)
  const prompt = await buildVoiceOrchestrationPrompt(supabase, input, coachTurn)
  const llmStart = Date.now()
  const stream = await anthropic.messages.create({
    model: coachTurn.model,
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
  input: VoiceOrchestratorInput,
  coachTurn: {
    mode: CoachMode
    memorySnapshot: CoachingMemorySnapshot
    sessionNumber: number
  },
): Promise<VoiceOrchestrationPrompt> {
  const [{ data: healthProfile }, { data: profile }, { data: personality }, { data: streakRow }, { data: sessions }] = await Promise.all([
    supabase.from('health_profiles').select('complaints').eq('user_id', input.userId).maybeSingle(),
    supabase.from('profiles').select('name').eq('id', input.userId).maybeSingle(),
    supabase.from('user_personality').select('coach_persona, feedback_style, language').eq('user_id', input.userId).maybeSingle(),
    supabase.from('streaks').select('current').eq('user_id', input.userId).maybeSingle(),
    supabase.from('sessions').select('created_at, completed_at').eq('user_id', input.userId).order('created_at', { ascending: false }).limit(1),
  ])

  const resolvedPersonality = mergeVoicePersonality(asVoicePersonality(personality), input.language)
  const outputLanguage = resolvedPersonality?.language === 'en' ? 'en' : 'de'
  const outputLocale = outputLanguage === 'en' ? 'en-US' : 'de-DE'
  const nowHour = new Date().getHours()
  const timeOfDay = nowHour < 11 ? 'morning' : nowHour < 17 ? 'midday' : 'evening'
  const lastSession = sessions?.[0]
    ? {
        date: new Date(sessions[0].created_at).toLocaleDateString(outputLocale),
        duration: 0,
        completedAll: Boolean(sessions[0].completed_at),
      }
    : undefined

  const system = `${buildDrMiaSystemPrompt({
    userName: profile?.name ?? 'du',
    streak: streakRow?.current ?? 0,
    bodyAreas: healthProfile?.complaints ?? [],
    memoryContext: toSessionMemoryContext(coachTurn.memorySnapshot),
    personality: resolvedPersonality,
    timeOfDay,
    lastSession,
    sessionNumber: coachTurn.sessionNumber,
    enableFiveWhys: false,
  })}\n\n${buildCoachPolicyPrompt(coachTurn.mode, coachTurn.memorySnapshot)}`

  const contextMessage = input.currentExercise?.name
    ? outputLanguage === 'en'
      ? `Current exercise: ${input.currentExercise.name}. Description: ${input.currentExercise.description ?? 'no extra description'}. Phase: ${input.currentExercise.phase ?? 'main'}. ${getPhaseHint(input.currentExercise.phase, outputLanguage)}`
      : `Aktuelle Uebung: ${input.currentExercise.name}. Beschreibung: ${input.currentExercise.description ?? 'keine zusaetzliche Beschreibung'}. Phase: ${input.currentExercise.phase ?? 'main'}. ${getPhaseHint(input.currentExercise.phase, outputLanguage)}`
    : outputLanguage === 'en'
      ? 'A physiotherapy session is currently in progress.'
      : 'Aktuell laeuft eine Physio-Session.'
  const workoutStateMessage = input.workoutState
    ? `WorkoutState: ${JSON.stringify({
        status: input.workoutState.status,
        currentExerciseIndex: input.workoutState.currentExerciseIndex,
        currentExercise: input.workoutState.exercises[input.workoutState.currentExerciseIndex] ?? null,
        exercises: input.workoutState.exercises,
      })}`
    : null
  const responseStyleMessage = outputLanguage === 'en'
    ? 'Response style: answer for the current coaching mode, concretely, without markdown and without overblown rhetoric.'
    : 'Antwortstil: antworte passend zum aktuellen Coaching-Modus, konkret, ohne Markdown und ohne ueberspielte Rhetorik.'

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

async function resolveCoachTurn(input: VoiceOrchestratorInput): Promise<{
  mode: CoachMode
  model: string
  memorySnapshot: CoachingMemorySnapshot
  sessionNumber: number
}> {
  const sessionNumber = input.sessionNumber ?? 1
  const memorySnapshot = await memoryResolver.getSessionSnapshot(input.userId, sessionNumber)
  const modeContext = buildModeContext(input)

  let mode = selectCoachMode(modeContext)
  if (
    mode !== 'safety'
    && shouldProbeMotivation({
      sessionCount: memorySnapshot.sessionCount,
      exerciseStatus: modeContext.exerciseStatus,
      kernMotivation: memorySnapshot.kernMotivation,
    })
  ) {
    mode = 'motivation'
  }

  return {
    mode,
    model: getModelForMode(mode),
    memorySnapshot,
    sessionNumber,
  }
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

function buildModeContext(input: VoiceOrchestratorInput): ModeContext {
  const workoutExercise = input.workoutState?.exercises[input.workoutState.currentExerciseIndex]
  const exercisePhase = input.exercisePhase
    ?? (isExercisePhase(input.currentExercise?.phase) ? input.currentExercise.phase : undefined)
    ?? workoutExercise?.phase
    ?? 'main'
  const exerciseStatus = input.exerciseStatus
    ?? workoutExercise?.status
    ?? 'active'
  const lastUtterance = [...(input.messages ?? [])]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?? ''

  return {
    exercisePhase,
    exerciseStatus: isExerciseStatus(exerciseStatus) ? exerciseStatus : 'active',
    lastUtterance,
  }
}

function isExercisePhase(value: unknown): value is ModeContext['exercisePhase'] {
  return value === 'warmup' || value === 'main' || value === 'cooldown'
}

function isExerciseStatus(value: unknown): value is ModeContext['exerciseStatus'] {
  return value === 'pending' || value === 'active' || value === 'completed' || value === 'skipped'
}

function toSessionMemoryContext(snapshot: CoachingMemorySnapshot): SessionMemoryContext {
  const personalityHints = snapshot.personalityPrefs
    ? [
        `Kommunikationsstil: ${snapshot.personalityPrefs.communicationStyle}`,
        `Ermutigung: ${snapshot.personalityPrefs.encouragementType}`,
      ]
    : []
  const patternHints = snapshot.trainingPatterns
    ? [
        ...(snapshot.trainingPatterns.knownPainPoints.length > 0
          ? [`Schmerzpunkte: ${snapshot.trainingPatterns.knownPainPoints.join(', ')}`]
          : []),
        ...(snapshot.trainingPatterns.preferredExercises.length > 0
          ? [`Bevorzugte Uebungen: ${snapshot.trainingPatterns.preferredExercises.join(', ')}`]
          : []),
        ...(snapshot.trainingPatterns.fatigueSignals.length > 0
          ? [`Ermuedungssignale: ${snapshot.trainingPatterns.fatigueSignals.join(', ')}`]
          : []),
      ]
    : []

  return {
    kernMotivation: snapshot.kernMotivation,
    personalityHints,
    patternHints,
    lifeContext: snapshot.lifeContext,
  }
}

function asVoicePersonality(value: unknown): Pick<UserPersonality, 'coach_persona' | 'feedback_style' | 'language'> | null {
  if (!isRecord(value)) {
    return null
  }

  const coachPersona = typeof value.coach_persona === 'string' ? value.coach_persona : null
  const feedbackStyle = value.feedback_style === 'direct'
    || value.feedback_style === 'gentle'
    || value.feedback_style === 'energetic'
    ? value.feedback_style
    : null
  const language = value.language === 'de' || value.language === 'en'
    ? value.language
    : null

  if (!coachPersona || !feedbackStyle || !language) {
    return null
  }

  return {
    coach_persona: coachPersona,
    feedback_style: feedbackStyle,
    language,
  }
}

function mergeVoicePersonality(
  personality: Pick<UserPersonality, 'coach_persona' | 'feedback_style' | 'language'> | null,
  languageOverride?: Language,
): Pick<UserPersonality, 'coach_persona' | 'feedback_style' | 'language'> | null {
  if (!personality && !languageOverride) {
    return null
  }

  return {
    coach_persona: personality?.coach_persona ?? 'tony_robbins',
    feedback_style: personality?.feedback_style ?? 'gentle',
    language: languageOverride ?? personality?.language ?? 'de',
  }
}
