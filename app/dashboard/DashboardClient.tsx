'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { useSoftNavigation } from '@/lib/navigation'
import { getLevelInfo, type Exercise, type Schedule, type Streak } from '@/lib/types'

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
  planSummary: string
  motivationSlogan: string
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
  planSummary,
  motivationSlogan,
}: Props) {
  const [isGenerating, setIsGenerating] = useState(!hasActivePlan)
  const [plan, setPlan] = useState<ActivePlan | null>(initialPlan)
  const [error, setError] = useState<string>()
  const [notificationPermission, setNotificationPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  )
  const router = useSoftNavigation()
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
    router.prefetch('/badges')
    router.prefetch('/plan')
    router.prefetch('/settings')
  }, [router])

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
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-[20px] bg-white px-2.5 py-3 text-center shadow-[var(--shadow-md)] animate-pop-in">
            <div className="text-xl">🔥</div>
            <div className="mt-0.5 text-lg font-extrabold text-[var(--text-primary)]">{streak?.current ?? 0}</div>
            <div className="text-[10px] font-medium leading-tight text-[var(--text-muted)]">Tage aktiv</div>
          </div>
          <div className="rounded-[20px] bg-white px-2.5 py-3 text-center shadow-[var(--shadow-md)] animate-pop-in" style={{ animationDelay: '80ms' }}>
            <div className="text-xl">⚡</div>
            <div className="mt-0.5 text-lg font-extrabold text-[var(--text-primary)]">{profile.xp}</div>
            <div className="text-[10px] font-medium leading-tight text-[var(--text-muted)]">XP gesamt</div>
          </div>
          <button
            onClick={() => router.push('/badges')}
            className="rounded-[20px] bg-white px-2.5 py-3 text-center shadow-[var(--shadow-md)] animate-pop-in"
            style={{ animationDelay: '160ms' }}
            aria-label="Badges öffnen"
          >
            <div className="text-xl">🏅</div>
            <div className="mt-0.5 text-lg font-extrabold text-[var(--text-primary)]">{earnedBadgeKeys.length}</div>
            <div className="text-[10px] font-medium leading-tight text-[var(--text-muted)]">Badges</div>
          </button>
        </div>

        <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Dein Warum</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{motivationSlogan}</p>
        </div>

        <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Aktiver Plan</h2>
            <span className="rounded-full bg-[var(--teal-light)] px-3 py-1 text-xs font-semibold text-[var(--teal)]">
              {plan?.source === 'physio' ? 'Physio' : 'AI'}
            </span>
          </div>
          <div className="mb-3 mt-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Diese Woche</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-muted)]">
                {schedule ? `${schedule.notify_time.slice(0, 5)} Uhr` : 'ohne Zeit'}
              </span>
              {notificationPermission !== 'unsupported' && notificationPermission !== 'granted' && (
                <button onClick={enableNotifications} className="text-xs font-semibold text-[var(--teal)]">
                  Reminder
                </button>
              )}
              {notificationPermission === 'granted' && (
                <span className="text-xs font-semibold text-[var(--teal)]">Reminder aktiv</span>
              )}
            </div>
          </div>
          <div className="mb-4 overflow-x-auto pb-1">
            <div className="relative mx-auto flex min-w-max items-center justify-center px-1">
              <div
                className="pointer-events-none absolute left-5 right-5 top-1/2 h-px -translate-y-1/2"
                style={{ background: 'color-mix(in srgb, var(--teal) 24%, white)' }}
              />
              <div className="relative flex items-center gap-2">
                {WEEK_DAYS.map(({ day, label }) => {
                  const planned = plannedDays.includes(day)
                  const done = completedWeekDays.includes(day)
                  return (
                    <div key={label} className="w-11 text-center">
                      <div
                        className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold"
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
            </div>
          </div>
          <div className="text-center text-sm font-semibold text-[var(--text-primary)]">
            {exercises.length} Übungen · ca. {totalMinutes} Minuten · {phaseCounts.warmup}/{phaseCounts.main}/{phaseCounts.cooldown}
          </div>
          <p className="mt-2 text-center text-sm leading-6 text-[var(--text-secondary)]">
            {planSummary}
          </p>
          <div className="mt-4">
            <button
              onClick={() => router.push('/training/session')}
              className="btn-primary w-full rounded-[12px] py-3 text-base"
            >
              Loslegen
            </button>
            <button
              onClick={() => router.push('/plan')}
              className="mt-2 w-full py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
            >
              Mehr Informationen zum Plan
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
