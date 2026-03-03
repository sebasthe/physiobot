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
          <div key={phase}>
            <div className="flex items-center gap-2 mb-3">
              <span>{config.emoji}</span>
              <span className="text-phase font-display" style={{ color: config.color, letterSpacing: '0.15em', fontSize: '0.65rem' }}>
                {config.label}
              </span>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                {phaseExercises.length} Übung{phaseExercises.length !== 1 ? 'en' : ''}
              </span>
            </div>
            <ul className="space-y-2">
              {phaseExercises.map((ex, i) => (
                <li key={i} className="exercise-card px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{ex.name}</div>
                    {ex.duration_seconds && (
                      <span className="font-display text-xs flex-shrink-0" style={{ color: 'var(--primary)' }}>
                        {ex.duration_seconds}s
                      </span>
                    )}
                    {ex.repetitions && ex.sets && (
                      <span className="font-display text-xs flex-shrink-0" style={{ color: 'var(--primary)' }}>
                        {ex.sets}×{ex.repetitions}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{ex.description}</div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <button
        onClick={onStartTraining}
        className="btn-primary w-full rounded-xl py-4 text-xl animate-pulse-glow"
      >
        Training starten
      </button>
    </div>
  )
}
