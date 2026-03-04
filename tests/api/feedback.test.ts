import { describe, it, expect } from 'vitest'
import { buildFeedbackPrompt } from '@/lib/claude/prompts'
import type { SessionFeedback } from '@/lib/types'

describe('buildFeedbackPrompt', () => {
  it('includes painful exercises in prompt', () => {
    const feedback: SessionFeedback[] = [
      { exercise_id: '1', difficulty: 'painful', notes: 'Knie schmerzt' },
    ]
    const prompt = buildFeedbackPrompt(feedback)
    expect(prompt).toContain('painful')
    expect(prompt).toContain('Knie schmerzt')
  })

  it('includes too_hard exercises', () => {
    const feedback: SessionFeedback[] = [
      { exercise_id: '2', difficulty: 'too_hard' },
    ]
    const prompt = buildFeedbackPrompt(feedback)
    expect(prompt).toContain('too_hard')
  })
})
