import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/claude/client'
import { buildSystemPrompt, buildPlanRequestMessage } from '@/lib/claude/prompts'
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

  const { data: memories } = await supabase
    .from('user_memories')
    .select('memory')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const memoryTexts = (memories ?? []).map((m: { memory: string }) => m.memory)

  const systemPrompt = buildSystemPrompt({
    personality: personality as UserPersonality,
    memories: memoryTexts,
  })

  const message = buildPlanRequestMessage({ healthProfile: healthProfile as HealthProfile })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    const planData = JSON.parse(content.text) as Pick<TrainingPlan, 'exercises'>

    const { data: plan, error } = await supabase
      .from('training_plans')
      .insert({
        assigned_to: user.id,
        created_by: user.id,
        source: 'ai',
        exercises: planData.exercises,
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
