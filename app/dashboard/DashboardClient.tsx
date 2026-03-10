'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Clock, Flame, Quote, Settings, Target, User, Zap } from 'lucide-react'
import { useSoftNavigation } from '@/lib/navigation'
import { Progress } from '@/components/ui/progress'
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
    <main className="dashboard-page vital-gradient min-h-screen overflow-x-hidden pb-32 lg:min-h-full lg:pb-12" style={{ paddingTop: 'var(--safe-top)' }}>
      <div className="dashboard-layout p-6 pt-12 lg:px-10 lg:pb-10 xl:grid xl:grid-cols-[minmax(0,0.78fr)_minmax(23rem,0.52fr)] xl:gap-x-8 xl:gap-y-10 xl:px-12 xl:pt-14">
        <div className="dashboard-topbar mb-10 flex items-center justify-between xl:col-span-2 xl:mb-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(42,157,138,0.2)] bg-[rgba(42,157,138,0.18)] text-[var(--accent)]">
              <User size={20} />
            </div>
            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-[0.24em] text-white/40">Momentum</div>
              <div className="flex items-center gap-1 text-sm font-bold text-white">
                {streak?.current ?? 0} Tage <Flame size={14} className="text-[var(--primary)]" />
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push('/settings')}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/5 text-white/70 backdrop-blur-sm"
            aria-label="Einstellungen"
          >
            <Settings size={18} />
          </button>
        </div>

        <div className="dashboard-hero mb-10 animate-slide-up xl:mb-0">
          <h1 className="dashboard-heading mb-3 font-display text-5xl uppercase leading-[0.9] tracking-tight text-white">
            Heute zählt
            <br />
            dein Momentum.
          </h1>
          <p className="dashboard-subcopy text-lg leading-snug text-white/60">
            {userName}, {motivationSlogan.charAt(0).toLowerCase() + motivationSlogan.slice(1)}
          </p>
        </div>

        <div className="dashboard-status relative mb-10 xl:mb-0 xl:self-start">
          <div className="absolute -inset-4 rounded-full bg-[rgba(42,157,138,0.06)] blur-3xl" />
          <div className="glass-card relative overflow-hidden rounded-[28px] border-white/5">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-white/40">Aktueller Status</div>
                  <div className="font-display text-xl uppercase tracking-tight text-[var(--accent)]">{levelInfo.title}</div>
                </div>
                <div className="text-right">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-white/40">Level</div>
                  <div className="font-display text-3xl leading-none text-white">{profile.level}</div>
                </div>
              </div>
              <Progress value={progress} className="h-1.5 bg-white/5" />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.24em] text-white/20">{profile.xp} XP</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
                  {nextThreshold} XP Ziel
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-focus mb-10 animate-slide-up xl:order-4 xl:mb-0 xl:self-start" style={{ animationDelay: '120ms' }}>
          <div className="flex items-start gap-4 rounded-3xl border border-[rgba(240,160,75,0.12)] bg-[rgba(240,160,75,0.05)] p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(240,160,75,0.18)] text-[var(--primary)]">
              <Target size={20} />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-[rgba(240,160,75,0.6)]">Dein Fokus</div>
              <p className="text-sm font-medium italic leading-6 text-white/80">
                "{planSummary}"
              </p>
            </div>
          </div>
        </div>

        <div className="dashboard-session glass-card relative overflow-hidden rounded-[30px] border-white/5 shadow-2xl shadow-[rgba(42,157,138,0.08)] xl:order-3 xl:self-start">
          <div className="absolute right-0 top-0 p-4">
            <span className="rounded-md bg-[rgba(42,157,138,0.12)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
              {plan?.source === 'physio' ? 'Physio' : 'Ready'}
            </span>
          </div>
          <div className="p-6 pb-2">
            <h2 className="mb-1 font-display text-3xl uppercase tracking-tight text-white">Heutige Session</h2>
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.18em] text-white/40">
              <div className="flex items-center gap-1">
                <Clock size={12} />
                {totalMinutes} Min
              </div>
              <div className="flex items-center gap-1">
                <Zap size={12} />
                {exercises.length} Übungen
              </div>
            </div>
          </div>
          <div className="px-6 pb-6 pt-0">
            <div className="mb-4 overflow-x-auto pb-1">
              <div className="relative mx-auto flex min-w-max items-center justify-center px-1">
                <div className="pointer-events-none absolute left-5 right-5 top-1/2 h-px -translate-y-1/2 bg-white/6" />
                <div className="relative flex items-center gap-2">
                  {WEEK_DAYS.map(({ day, label }) => {
                    const planned = plannedDays.includes(day)
                    const done = completedWeekDays.includes(day)
                    return (
                      <div key={label} className="w-11 text-center">
                        <div
                          className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold"
                          style={{
                            borderColor: planned ? 'rgba(42,157,138,0.32)' : 'rgba(255,255,255,0.08)',
                            background: done ? 'var(--accent)' : planned ? 'rgba(42,157,138,0.12)' : 'rgba(255,255,255,0.04)',
                            color: done ? '#ffffff' : planned ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
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

            <div className="mb-6 rounded-xl bg-white/5 p-4">
              <p className="text-sm leading-relaxed text-white/60">
                <span className="font-bold text-[var(--accent)]">Entscheidung treffen:</span> {planSummary}
              </p>
              <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/30">
                <span>{phaseCounts.warmup} Warm-up</span>
                <span>{phaseCounts.main} Main</span>
                <span>{phaseCounts.cooldown} Cool-down</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/30">
                <span>{schedule ? `${schedule.notify_time.slice(0, 5)} Uhr` : 'Ohne Zeit'}</span>
                <span>{earnedBadgeKeys.length} Badges</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/30">
                {notificationPermission !== 'unsupported' && notificationPermission !== 'granted' ? (
                  <button onClick={enableNotifications} className="font-bold text-[var(--accent)]">
                    Reminder aktivieren
                  </button>
                ) : notificationPermission === 'granted' ? (
                  <span className="font-bold text-[var(--accent)]">Reminder aktiv</span>
                ) : null}
              </div>
            </div>

            <button
              onClick={() => router.push('/training/session')}
              className="btn-primary group flex w-full items-center justify-center rounded-2xl py-8 font-display text-xl uppercase tracking-[0.14em]"
            >
              Jetzt Momentum nutzen
              <ArrowRight size={24} className="ml-2 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={() => router.push('/plan')}
              className="mt-3 w-full text-xs font-semibold uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white/60"
            >
              Mehr zum Plan
            </button>
          </div>
        </div>

        <div className="dashboard-quote mt-12 px-8 text-center xl:col-span-2 xl:mt-0 xl:pt-4">
          <Quote size={24} className="mx-auto mb-4 text-white/10" />
          <p className="font-display text-lg uppercase leading-tight tracking-tight text-white/40">
            "Energie fließt dahin, wo die Aufmerksamkeit hingeht."
          </p>
          <div className="mx-auto mt-4 h-1 w-8 rounded-full bg-[rgba(42,157,138,0.2)]" />
        </div>
      </div>
    </main>
  )
}
