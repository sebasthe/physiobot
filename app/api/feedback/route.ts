import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/claude/client'
import { buildSystemPrompt, buildFeedbackPrompt } from '@/lib/claude/prompts'
import { extractAndStoreMemories, getRelevantMemories } from '@/lib/mem0'
import type { SessionFeedback, UserPersonality, Exercise } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, feedback } = await request.json() as {
    sessionId: string | null
    feedback: SessionFeedback[]
  }

  // Save feedback to session if we have a session ID
  if (sessionId) {
    await supabase
      .from('sessions')
      .update({ feedback, completed_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  // Store painful exercises in user memory for future plan personalization
  const painfulExercises = feedback.filter((f: SessionFeedback) => f.difficulty === 'painful')
  if (painfulExercises.length > 0) {
    const summary = `Session-Feedback: Schmerzhafte Übungen: ${painfulExercises.map((f: SessionFeedback) => f.notes ?? f.exercise_id).join(', ')}`
    await extractAndStoreMemories(user.id, summary).catch(console.error)
  }

  // Get current plan + user context
  const [{ data: personality }, { data: profile }] = await Promise.all([
    supabase.from('user_personality').select('*').eq('user_id', user.id).single(),
    supabase.from('profiles').select('active_plan_id').eq('id', user.id).single(),
  ])

  if (!personality || !profile?.active_plan_id) return NextResponse.json({ ok: true })

  const { data: plan } = await supabase
    .from('training_plans')
    .select('exercises')
    .eq('id', profile.active_plan_id)
    .single()

  if (!plan) return NextResponse.json({ ok: true })

  const memoryTexts = await getRelevantMemories(
    user.id,
    `Physiotherapie Feedback ${feedback.map(f => f.exercise_id).join(' ')}`
  ).catch(() => [])

  const systemPrompt = buildSystemPrompt({
    personality: personality as UserPersonality,
    memories: memoryTexts,
  })

  const currentExercisesJson = JSON.stringify({ exercises: plan.exercises })
  const feedbackPrompt = buildFeedbackPrompt(feedback)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Aktueller Plan:\n${currentExercisesJson}\n\n${feedbackPrompt}` },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response')

    const updatedPlan = JSON.parse(content.text) as { exercises: Exercise[] }

    const { data: newPlan } = await supabase
      .from('training_plans')
      .insert({
        assigned_to: user.id,
        created_by: user.id,
        source: 'ai',
        exercises: updatedPlan.exercises,
      })
      .select()
      .single()

    if (newPlan) {
      await supabase
        .from('profiles')
        .update({ active_plan_id: newPlan.id })
        .eq('id', user.id)
    }
  } catch (err) {
    console.error('Plan adjustment failed:', err)
  }

  return NextResponse.json({ ok: true })
}
