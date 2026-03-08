import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/claude/client'
import { buildSystemPrompt, buildFeedbackPrompt } from '@/lib/claude/prompts'
import { extractJson } from '@/lib/claude/extract-json'
import { addSessionTranscript, extractAndStoreMemories, getRelevantMemories, type TranscriptMessage } from '@/lib/mem0'
import { updateGamification } from '@/lib/gamification'
import type { SessionFeedback, UserPersonality, Exercise } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    transcript?: TranscriptMessage[]
    exercises?: Exercise[]
    sessionId: string | null
    feedback: SessionFeedback[]
  }
  const { sessionId, feedback } = body
  const transcript = body.transcript ?? []
  const completedExercises = body.exercises ?? []

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
  if (transcript.length > 0) {
    await addSessionTranscript(user.id, transcript, sessionId ?? undefined).catch(console.error)
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

  const gamification = await updateGamification(
    supabase,
    user.id,
    completedExercises.length > 0 ? completedExercises : (plan.exercises as Exercise[]),
    sessionId ?? undefined
  ).catch(err => {
    console.error('Gamification update failed:', err)
    return null
  })

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

    const updatedPlan = extractJson<{ exercises: Exercise[] }>(content.text)

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

  return NextResponse.json({ ok: true, gamification })
}
