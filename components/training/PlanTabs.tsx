'use client'

import { useMemo, useState } from 'react'
import { Flame, Wind, Zap } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { Exercise } from '@/lib/types'

interface PlanTabsProps {
  exercises: Exercise[]
}

export default function PlanTabs({ exercises }: PlanTabsProps) {
  const { messages } = useI18n()
  const phases = [
    { key: 'warmup', label: messages.plan.tabWarmup, icon: Flame },
    { key: 'main', label: messages.plan.tabMain, icon: Zap },
    { key: 'cooldown', label: messages.plan.tabCooldown, icon: Wind },
  ] as const
  const [activePhase, setActivePhase] = useState<(typeof phases)[number]['key']>('main')

  const phaseExercises = useMemo(
    () => exercises.filter(exercise => exercise.phase === activePhase),
    [activePhase, exercises]
  )

  return (
    <div>
      <div className="mb-5 grid w-full grid-cols-3 gap-1.5 rounded-[1.35rem] border border-white/5 bg-[rgba(20,18,16,0.92)] p-1.5 md:mb-10 md:flex md:flex-nowrap md:rounded-[1.6rem] md:gap-2">
        {phases.map(({ key, label, icon: Icon }) => {
          const isActive = activePhase === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActivePhase(key)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[1.05rem] px-2.5 py-2.5 text-[0.58rem] font-bold uppercase tracking-[0.17em] transition-all md:gap-2 md:rounded-[1.15rem] md:px-3 md:py-3 md:text-[0.62rem] ${
                isActive ? 'bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(42,157,138,0.18)]' : 'text-white/50 hover:bg-white/4'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          )
        })}
      </div>

      <div className="mb-3 flex items-center justify-between md:mb-6">
        <h3 className="font-display text-[1.7rem] uppercase tracking-tight text-white md:text-[1.9rem]">
          {phases.find(phase => phase.key === activePhase)?.label}
        </h3>
        <span className="text-xs uppercase tracking-[0.18em] text-white/20">
          {messages.plan.exerciseCount.replace('{count}', String(phaseExercises.length))}
        </span>
      </div>

      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        {phaseExercises.map((exercise, index) => (
          <div
            key={exercise.id || `${activePhase}-${index}`}
            className="glass-card relative overflow-hidden rounded-[20px] border-white/5 shadow-[0_18px_40px_rgba(0,0,0,0.16)] md:rounded-[22px]"
          >
            <div className="px-4 pb-2 pt-4 md:px-6 md:pt-6">
              <div className="flex items-start justify-between gap-4">
                <h4 className="text-lg font-semibold leading-snug text-white">{exercise.name}</h4>
                <span className="rounded-full border border-white/6 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/46">
                  {exercise.duration_seconds ? `${exercise.duration_seconds}s` : `${exercise.sets ?? 1}x${exercise.repetitions ?? 8}`}
                </span>
              </div>
            </div>
            <div className="px-4 pb-4 md:px-6 md:pb-6">
              <p className="text-sm leading-6 text-white/54 md:leading-7">{exercise.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
