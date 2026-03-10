'use client'

import { cn } from '@/lib/utils'
import type { TurnState } from '../core/types'

interface VoiceStatusIndicatorProps {
  state: TurnState
  labels?: Partial<Record<TurnState, string>>
  className?: string
}

const DEFAULT_LABELS: Record<TurnState, string> = {
  idle: 'Bereit',
  listening: 'Hoert zu...',
  processing: 'Versteht...',
  speaking: 'Antwortet...',
}

const STATE_STYLES: Record<TurnState, string> = {
  idle: 'bg-muted text-muted-foreground',
  listening: 'bg-emerald-500/14 text-emerald-300',
  processing: 'bg-amber-500/14 text-amber-200',
  speaking: 'bg-sky-500/14 text-sky-200',
}

const DOT_STYLES: Record<TurnState, string> = {
  idle: 'bg-muted-foreground/70',
  listening: 'bg-emerald-400 animate-pulse',
  processing: 'bg-amber-300 animate-pulse',
  speaking: 'bg-sky-300 animate-pulse',
}

export function VoiceStatusIndicator({ state, labels, className }: VoiceStatusIndicatorProps) {
  const resolvedLabels = {
    ...DEFAULT_LABELS,
    ...labels,
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]',
        STATE_STYLES[state],
        className,
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', DOT_STYLES[state])} />
      <span>{resolvedLabels[state]}</span>
    </div>
  )
}
