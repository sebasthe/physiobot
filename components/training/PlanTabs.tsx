'use client'

import { useMemo, useState } from 'react'
import { Flame, Wind, Zap } from 'lucide-react'
import type { Exercise } from '@/lib/types'

const PHASES = [
  { key: 'warmup', label: 'Warm-up', icon: Flame },
  { key: 'main', label: 'Main', icon: Zap },
  { key: 'cooldown', label: 'Cool-down', icon: Wind },
] as const

interface PlanTabsProps {
  exercises: Exercise[]
}

export default function PlanTabs({ exercises }: PlanTabsProps) {
  const [activePhase, setActivePhase] = useState<(typeof PHASES)[number]['key']>('main')

  const phaseExercises = useMemo(
    () => exercises.filter(exercise => exercise.phase === activePhase),
    [activePhase, exercises]
  )

  return (
    <div>
      <div className="mb-12 flex w-full flex-wrap gap-2 rounded-3xl border border-white/5 bg-[rgba(26,23,20,0.9)] p-1 md:flex-nowrap">
        {PHASES.map(({ key, label, icon: Icon }) => {
          const isActive = activePhase === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActivePhase(key)}
              className={`flex min-w-[calc(50%-0.25rem)] flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-4 text-[10px] font-bold uppercase tracking-[0.18em] transition-all sm:min-w-0 ${
                isActive ? 'bg-[var(--accent)] text-white' : 'text-white/50 hover:bg-white/4'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          )
        })}
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-display text-2xl uppercase tracking-tight text-white">
          {PHASES.find(phase => phase.key === activePhase)?.label}
        </h3>
        <span className="text-xs uppercase tracking-[0.18em] text-white/20">
          {phaseExercises.length} Übungen
        </span>
      </div>

      <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        {phaseExercises.map((exercise, index) => (
          <div
            key={`${activePhase}-${index}`}
            className="glass-card relative overflow-hidden rounded-[26px] border-white/5"
          >
            <div className="px-6 pb-2 pt-6">
              <div className="flex items-start justify-between gap-4">
                <h4 className="text-lg font-semibold text-white">{exercise.name}</h4>
                <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  {exercise.duration_seconds ? `${exercise.duration_seconds}s` : `${exercise.sets ?? 1}x${exercise.repetitions ?? 8}`}
                </span>
              </div>
            </div>
            <div className="px-6 pb-6">
              <p className="text-sm leading-relaxed text-white/40">{exercise.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
