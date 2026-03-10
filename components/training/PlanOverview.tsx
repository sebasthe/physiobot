import type { Exercise } from '@/lib/types'

const PHASE_CONFIG = {
  warmup:  { label: 'AUFWÄRMEN',  emoji: '🔥', color: 'rgba(240,160,75,0.7)' },
  main:    { label: 'HAUPTTEIL',  emoji: '⚡', color: 'var(--primary)' },
  cooldown:{ label: 'COOLDOWN',   emoji: '🌿', color: 'rgba(76,175,130,0.8)' },
} as const

interface Props {
  exercises: Exercise[]
  onStartTraining: () => void
}

export default function PlanOverview({ exercises, onStartTraining }: Props) {
  const phases = ['warmup', 'main', 'cooldown'] as const

  return (
    <div className="space-y-6">
      {phases.map(phase => {
        const phaseExercises = exercises.filter(e => e.phase === phase)
        if (phaseExercises.length === 0) return null
        const config = PHASE_CONFIG[phase]
        return (
          <div key={phase} className="surface-card p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xl">{config.emoji}</span>
              <span className="text-phase" style={{ color: config.color, letterSpacing: '0.15em', fontSize: '0.65rem' }}>
                {config.label}
              </span>
              <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                {phaseExercises.length} Übung{phaseExercises.length !== 1 ? 'en' : ''}
              </span>
            </div>
            <ul className="space-y-3">
              {phaseExercises.map((ex, i) => (
                <li key={i} className="exercise-card px-4 py-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[15px]" style={{ color: 'var(--foreground)' }}>{ex.name}</div>
                      <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{ex.description}</div>
                    </div>
                    <div className="rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap" style={{ background: 'var(--teal-light)', color: 'var(--accent)' }}>
                      {ex.duration_seconds ? `${ex.duration_seconds}s` : `${ex.sets}×${ex.repetitions}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <button
        onClick={onStartTraining}
        className="btn-primary w-full rounded-[18px] py-4 text-lg animate-pulse-glow"
      >
        Training starten
      </button>
    </div>
  )
}
