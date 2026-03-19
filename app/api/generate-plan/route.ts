import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/claude/client'
import { buildSystemPrompt, buildPlanRequestMessage } from '@/lib/claude/prompts'
import { extractJson } from '@/lib/claude/extract-json'
import { normalizeStoredExercises } from '@/lib/exercises'
import { getRelevantMemories } from '@/lib/mem0'
import type { HealthProfile, UserPersonality, TrainingPlan } from '@/lib/types'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: personality }, { data: healthProfile }] = await Promise.all([
    supabase.from('user_personality').select('*').eq('user_id', user.id).single(),
    supabase.from('health_profiles').select('*').eq('user_id', user.id).single(),
  ])

  if (!personality || !healthProfile) {
    return NextResponse.json({ error: 'Profile incomplete' }, { status: 400 })
  }

  const memoryTexts = await getRelevantMemories(
    user.id,
    `Physiotherapie Training ${healthProfile.complaints.join(' ')}`
  ).catch(() => []) // graceful fallback if Mem0 unavailable

  const systemPrompt = buildSystemPrompt({
    personality: personality as UserPersonality,
    memories: memoryTexts,
  })

  const typedPersonality = personality as UserPersonality
  const message = buildPlanRequestMessage({
    healthProfile: healthProfile as HealthProfile,
    language: typedPersonality.language,
  })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    const planData = extractJson<Pick<TrainingPlan, 'exercises'>>(content.text)
    const normalizedExercises = normalizeStoredExercises(planData.exercises, typedPersonality.language)

    const { data: plan, error } = await supabase
      .from('training_plans')
      .insert({
        assigned_to: user.id,
        created_by: user.id,
        source: 'ai',
        exercises: normalizedExercises,
      })
      .select()
      .single()

    if (error) throw error

    await supabase
      .from('profiles')
      .update({ active_plan_id: plan.id })
      .eq('id', user.id)

    return NextResponse.json(plan)
  } catch (err) {
    console.error('Plan generation failed:', err)
    return NextResponse.json({ error: 'Plan generation failed' }, { status: 500 })
  }
}
