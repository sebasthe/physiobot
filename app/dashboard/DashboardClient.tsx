'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PlanOverview from '@/components/training/PlanOverview'
import { ALL_BADGES, getLevelInfo, type Exercise, type Schedule, type Streak } from '@/lib/types'

interface Props {
  hasActivePlan: boolean
  initialExercises: Exercise[]
  profile: {
    name: string | null
    xp: number
    level: number
  }
  streak: Streak | null
  earnedBadgeKeys: string[]
  schedule: Schedule | null
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export default function DashboardClient({
  hasActivePlan,
  initialExercises,
  profile,
  streak,
  earnedBadgeKeys,
  schedule,
}: Props) {
  const [isGenerating, setIsGenerating] = useState(!hasActivePlan)
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises)
  const [error, setError] = useState<string>()
  const router = useRouter()
  const levelInfo = getLevelInfo(profile.xp)
  const nextThreshold = Number.isFinite(levelInfo.max) ? levelInfo.max : profile.xp + 250
  const progress = Math.min(100, ((profile.xp - levelInfo.min) / Math.max(1, nextThreshold - levelInfo.min)) * 100)
  const userName = profile.name?.trim() || 'du'
  const completedCount = Math.max(1, Math.ceil(exercises.length * 0.25))

  useEffect(() => {
    if (!hasActivePlan) generatePlan()
  }, [])

  const generatePlan = async () => {
    setIsGenerating(true)
    setError(undefined)
    try {
      const res = await fetch('/api/generate-plan', { method: 'POST' })
      if (!res.ok) throw new Error('Plan generation failed')
      const plan = await res.json()
      setExercises(plan.exercises as Exercise[])
    } catch {
      setError('Plan konnte nicht erstellt werden. Bitte erneut versuchen.')
    }
    setIsGenerating(false)
  }

  if (isGenerating) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="mx-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full animate-pulse-glow"
            style={{ background: 'var(--teal-light)', border: '2px solid var(--teal)' }}>
            <span className="text-3xl">🩺</span>
          </div>
          <div className="font-display text-3xl italic" style={{ color: 'var(--foreground)' }}>
            Plan wird erstellt
          </div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Dr. Mia stellt dein heutiges Programm zusammen.
          </div>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4">
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          <button onClick={generatePlan} className="btn-primary rounded-xl px-6 py-3">
            Erneut versuchen
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-10" style={{ paddingTop: 'var(--safe-top)' }}>
      <section
        className="relative overflow-hidden px-6 pb-10 pt-6"
        style={{ background: 'linear-gradient(135deg, #1D7A6A 0%, #2A9D8A 55%, #3BB89A 100%)' }}
      >
        <div className="absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/8" />
        <div className="absolute -bottom-20 left-0 h-40 w-40 rounded-full bg-white/7" />
        <div className="relative z-10">
          <div className="mb-6 flex items-start justify-between">
            <div className="rounded-full border border-white/20 bg-white/14 px-4 py-2 text-white backdrop-blur">
              <span className="text-lg font-extrabold">{streak?.current ?? 0}</span>
              <span className="ml-2 text-sm font-semibold">Tage Streak</span>
            </div>
            <button className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/14 text-white">
              •
            </button>
          </div>
          <div className="mb-5">
            <div className="mb-2 inline-flex rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-white/80">
              Heute mit Dr. Mia
            </div>
            <h1 className="font-display text-4xl leading-tight text-white md:text-5xl">
              Guten Morgen, <em>{userName}</em>.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/78">
              Kleine Schritte heute. Konstanz baut Vertrauen in deinen Körper auf.
            </p>
          </div>
          <div className="rounded-2xl border border-white/18 bg-white/12 p-4 backdrop-blur">
            <div className="mb-2 flex items-center justify-between text-xs text-white/75">
              <span>Level {profile.level} · {levelInfo.title}</span>
              <strong className="text-white">{profile.xp} XP</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="relative h-full rounded-full"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #A8F0E0, #6FD4C0)' }}
              >
                <div
                  className="absolute inset-y-0 left-[-3rem] w-10"
                  style={{
                    animation: 'shimmer 2.2s infinite',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                  }}
                />
              </div>
            </div>
            <div className="mt-2 text-right text-xs font-semibold text-[#A8F0E0]">
              {Math.max(0, nextThreshold - profile.xp)} XP bis Level {profile.level + 1}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-6 px-4">
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { emoji: '🔥', value: streak?.current ?? 0, label: 'Tage aktiv' },
            { emoji: '⚡', value: profile.xp, label: 'XP gesamt' },
            { emoji: '🏅', value: earnedBadgeKeys.length, label: 'Badges' },
          ].map((item, index) => (
            <div key={item.label} className="rounded-2xl bg-white px-3 py-4 text-center shadow-[var(--shadow-md)] animate-pop-in" style={{ animationDelay: `${index * 80}ms` }}>
              <div className="text-2xl">{item.emoji}</div>
              <div className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">{item.value}</div>
              <div className="text-[11px] font-medium text-[var(--text-muted)]">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Heute</h2>
          <button className="text-sm font-semibold text-[var(--teal)]" onClick={() => router.push('/training/session')}>
            Loslegen
          </button>
        </div>
        <div className="mb-5 overflow-hidden rounded-[20px] shadow-[var(--shadow-md)]">
          <div className="relative px-5 py-6 text-white" style={{ background: 'linear-gradient(135deg, #F0724A, #F5A26A)' }}>
            <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
            <div className="relative z-10">
              <div className="mb-2 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-bold">Heutige Session</div>
              <h3 className="font-display text-3xl leading-tight">Sanft aktivieren.</h3>
              <p className="mt-2 text-sm text-white/80">
                {exercises.length} Übungen · Fokus auf Nacken, Haltung und ruhige Bewegung
              </p>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white" style={{ width: `${(completedCount / Math.max(1, exercises.length)) * 100}%` }} />
                </div>
                <span className="text-sm font-semibold">{completedCount}/{Math.max(1, exercises.length)}</span>
              </div>
            </div>
          </div>
        </div>

        <PlanOverview
          exercises={exercises}
          onStartTraining={() => router.push('/training/session')}
        />

        <div className="mt-7">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Badges</h2>
            <span className="text-sm text-[var(--text-muted)]">{earnedBadgeKeys.length}/{ALL_BADGES.length}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {ALL_BADGES.map(badge => {
              const earned = earnedBadgeKeys.includes(badge.key)
              return (
                <div
                  key={badge.key}
                  className="min-w-28 rounded-[20px] border bg-white p-4 text-center shadow-[var(--shadow-sm)]"
                  style={{
                    borderColor: earned ? 'var(--gold)' : 'var(--border)',
                    background: earned ? 'var(--gold-light)' : 'var(--card)',
                    opacity: earned ? 1 : 0.55,
                  }}
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: earned ? 'var(--gold-light)' : 'var(--sand)' }}>
                    {badge.emoji}
                  </div>
                  <div className="mt-3 text-xs font-bold text-[var(--text-primary)]">{badge.name}</div>
                  <div className="mt-1 text-[10px] text-[var(--text-muted)]">{badge.description}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-7 rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--teal)] text-2xl text-white">🩺</div>
            <div>
              <div className="font-semibold text-[var(--text-primary)]">Dr. Mia</div>
              <div className="text-sm text-[var(--text-secondary)]">Dein Coach für heute</div>
            </div>
          </div>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            {streak?.current ? `Du hältst seit ${streak.current} Tagen durch. Heute zählt wieder die ruhige Wiederholung, nicht Perfektion.` : 'Wir starten bewusst sanft. Eine kurze Session heute ist besser als auf den perfekten Moment zu warten.'}
          </p>
        </div>

        <div className="mt-5 rounded-[20px] border border-[var(--border)] bg-[var(--sand)] p-5">
          <div className="text-sm font-semibold text-[var(--text-primary)]">Rhythmus</div>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {schedule
              ? `${WEEKDAYS.filter((_, idx) => schedule.days.includes(idx)).join(', ')} um ${schedule.notify_time.slice(0, 5)} Uhr`
              : 'Noch kein Trainingsrhythmus gespeichert'}
          </p>
        </div>
      </section>
    </main>
  )
}
