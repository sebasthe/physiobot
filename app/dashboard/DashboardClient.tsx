'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { ALL_BADGES, getLevelInfo, type Exercise, type Schedule, type Streak } from '@/lib/types'

interface ActivePlan {
  id: string
  exercises: Exercise[]
  created_at: string
  source: 'ai' | 'physio'
}

interface Props {
  hasActivePlan: boolean
  initialPlan: ActivePlan | null
  profile: {
    name: string | null
    xp: number
    level: number
  }
  streak: Streak | null
  earnedBadgeKeys: string[]
  schedule: Schedule | null
  completedWeekDays: number[]
}

const WEEK_DAYS = [
  { day: 1, label: 'Mo' },
  { day: 2, label: 'Di' },
  { day: 3, label: 'Mi' },
  { day: 4, label: 'Do' },
  { day: 5, label: 'Fr' },
  { day: 6, label: 'Sa' },
  { day: 0, label: 'So' },
]

function parseNotifyTime(value: string | undefined) {
  if (!value) return { hours: 7, minutes: 30 }
  const [hoursStr = '7', minutesStr = '30'] = value.split(':')
  return {
    hours: Number(hoursStr),
    minutes: Number(minutesStr),
  }
}

function getNextReminderTime(days: number[], notifyTime: string | undefined): Date | null {
  const now = new Date()
  const { hours, minutes } = parseNotifyTime(notifyTime)

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(now)
    date.setDate(now.getDate() + offset)
    if (!days.includes(date.getDay())) continue

    const trainingStart = new Date(date)
    trainingStart.setHours(hours, minutes, 0, 0)
    const reminder = new Date(trainingStart.getTime() - 5 * 60 * 1000)

    if (reminder > now) return reminder
    if (trainingStart > now && trainingStart.getTime() - now.getTime() <= 5 * 60 * 1000) {
      const immediate = new Date(now)
      immediate.setSeconds(now.getSeconds() + 1, 0)
      return immediate
    }
  }

  return null
}

export default function DashboardClient({
  hasActivePlan,
  initialPlan,
  profile,
  streak,
  earnedBadgeKeys,
  schedule,
  completedWeekDays,
}: Props) {
  const [isGenerating, setIsGenerating] = useState(!hasActivePlan)
  const [plan, setPlan] = useState<ActivePlan | null>(initialPlan)
  const [error, setError] = useState<string>()
  const [notificationPermission, setNotificationPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  )
  const router = useRouter()
  const reminderTimerRef = useRef<number | null>(null)

  const levelInfo = getLevelInfo(profile.xp)
  const nextThreshold = Number.isFinite(levelInfo.max) ? levelInfo.max : profile.xp + 250
  const progress = Math.min(100, ((profile.xp - levelInfo.min) / Math.max(1, nextThreshold - levelInfo.min)) * 100)
  const userName = profile.name?.trim() || 'du'
  const exercises = plan?.exercises ?? []
  const plannedDays = schedule?.days ?? [1, 3, 5]
  const totalMinutes = Math.max(1, Math.round(
    exercises.reduce((sum, exercise) => sum + (exercise.duration_seconds ?? 45), 0) / 60
  ))
  const phaseCounts = useMemo(() => ({
    warmup: exercises.filter(exercise => exercise.phase === 'warmup').length,
    main: exercises.filter(exercise => exercise.phase === 'main').length,
    cooldown: exercises.filter(exercise => exercise.phase === 'cooldown').length,
  }), [exercises])

  useEffect(() => {
    if (!hasActivePlan) void generatePlan()
  }, [])

  useEffect(() => {
    if (notificationPermission !== 'granted' || !schedule) return
    if (typeof window === 'undefined') return

    const reminderAt = getNextReminderTime(schedule.days, schedule.notify_time)
    if (!reminderAt) return

    const delay = reminderAt.getTime() - Date.now()
    if (delay <= 0 || delay > 24 * 60 * 60 * 1000) return

    if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current)
    reminderTimerRef.current = window.setTimeout(() => {
      new Notification('PhysioCoach', {
        body: 'Dein Training startet in 5 Minuten.',
      })
    }, delay)

    return () => {
      if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current)
      reminderTimerRef.current = null
    }
  }, [notificationPermission, schedule])

  const generatePlan = async () => {
    setIsGenerating(true)
    setError(undefined)
    try {
      const res = await fetch('/api/generate-plan', { method: 'POST' })
      if (!res.ok) throw new Error('Plan generation failed')
      const generated = await res.json()
      setPlan({
        id: generated.id,
        exercises: (generated.exercises as Exercise[]) ?? [],
        created_at: generated.created_at ?? new Date().toISOString(),
        source: (generated.source as 'ai' | 'physio') ?? 'ai',
      })
    } catch {
      setError('Plan konnte nicht erstellt werden. Bitte erneut versuchen.')
    }
    setIsGenerating(false)
  }

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
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
            <button
              onClick={() => router.push('/settings')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/14 text-white"
              aria-label="Einstellungen"
            >
              <Settings size={18} />
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

      <section className="relative z-10 -mt-6 px-4 space-y-5">
        <div className="grid grid-cols-3 gap-3">
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

        <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Aktiver Plan</h2>
            <span className="rounded-full bg-[var(--teal-light)] px-3 py-1 text-xs font-semibold text-[var(--teal)]">
              {plan?.source === 'physio' ? 'Physio' : 'AI'}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {exercises.length} Übungen · ca. {totalMinutes} Minuten · {phaseCounts.warmup}/{phaseCounts.main}/{phaseCounts.cooldown} Warmup/Haupt/Cooldown
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => router.push('/training/session')}
              className="btn-primary rounded-[12px] py-3 text-sm"
            >
              Training starten
            </button>
            <button
              onClick={() => router.push('/plan')}
              className="rounded-[12px] border border-[var(--border)] bg-[var(--sand)] py-3 text-sm font-semibold text-[var(--text-primary)]"
            >
              Mehr Informationen
            </button>
          </div>
        </div>

        <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Wochenübersicht</h2>
            <span className="text-xs text-[var(--text-muted)]">
              {schedule ? `${schedule.notify_time.slice(0, 5)} Uhr` : 'ohne Zeit'}
            </span>
          </div>
          <div className="flex items-start gap-3 overflow-x-auto pb-1">
            {WEEK_DAYS.map(({ day, label }) => {
              const planned = plannedDays.includes(day)
              const done = completedWeekDays.includes(day)
              return (
                <div key={label} className="min-w-[56px] text-center">
                  <div
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border text-sm font-bold"
                    style={{
                      borderColor: planned ? 'var(--teal)' : 'var(--border)',
                      background: done ? 'var(--teal)' : planned ? 'var(--teal-light)' : 'var(--sand)',
                      color: done ? 'white' : planned ? 'var(--teal)' : 'var(--text-secondary)',
                    }}
                  >
                    {done ? '✓' : label}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">✓ = Training erledigt</span>
            {notificationPermission !== 'unsupported' && notificationPermission !== 'granted' && (
              <button onClick={enableNotifications} className="font-semibold text-[var(--teal)]">
                Reminder aktivieren
              </button>
            )}
            {notificationPermission === 'granted' && (
              <span className="font-semibold text-[var(--teal)]">Reminder aktiv</span>
            )}
          </div>
        </div>

        <div>
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
      </section>
    </main>
  )
}
