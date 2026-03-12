import type { CoachMode, ModeContext, MotivationContext } from './types'

const SAFETY_KEYWORDS = [
  'tut weh',
  'schmerz',
  'weh',
  'zu schwer',
  'kann nicht',
  'aufhoeren',
  'aufhören',
  'stop',
  'hilfe',
  'schlecht',
  'schwindel',
  'uebel',
  'übel',
  'kribbel',
  'taub',
]

const MODEL_MAP: Record<CoachMode, string> = {
  performance: 'claude-haiku-4-5-20251001',
  guidance: 'claude-haiku-4-5-20251001',
  safety: 'claude-sonnet-4-5-20241022',
  motivation: 'claude-sonnet-4-5-20241022',
}

export function selectCoachMode(context: ModeContext): CoachMode {
  const utterance = context.lastUtterance.toLowerCase()

  if (SAFETY_KEYWORDS.some(keyword => utterance.includes(keyword))) {
    return 'safety'
  }

  if (context.exerciseStatus === 'completed' || context.exercisePhase === 'cooldown') {
    return 'guidance'
  }

  if (context.exerciseStatus === 'active') {
    return 'performance'
  }

  return 'guidance'
}

export function getModelForMode(mode: CoachMode): string {
  return MODEL_MAP[mode]
}

export function shouldProbeMotivation(context: MotivationContext): boolean {
  return context.sessionCount <= 3
    && context.exerciseStatus === 'completed'
    && !context.kernMotivation
}
