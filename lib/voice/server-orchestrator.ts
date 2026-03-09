import { anthropic } from '@/lib/claude/client'
import { buildDrMiaSystemPrompt } from '@/lib/claude/prompts'
import { getSessionContext, type TranscriptMessage } from '@/lib/mem0'

interface VoiceOrchestratorInput {
  userId: string
  messages?: TranscriptMessage[]
  currentExercise?: { name?: string; description?: string; phase?: string }
  sessionNumber?: number
}

interface VoiceOrchestratorResult {
  reply: string
  llmLatencyMs: number
}

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

  const responseStyleMessage = 'Antwortstil: maximal 2-3 kurze Sätze, konkrete nächste Aktion, empathisch aber ohne Schreiwörter oder übertriebene Rhetorik.'

  const messages = [
    { role: 'user' as const, content: contextMessage },
    { role: 'user' as const, content: responseStyleMessage },
    ...((input.messages ?? []).map(message => ({
      role: message.role,
      content: message.content,
    }))),
  ]

  const llmStart = Date.now()
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
    messages,
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
