import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const WEEKDAYS = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'So' },
]

export default async function SchedulePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: schedule } = await supabase
    .from('schedules')
    .select('days, notify_time, timezone')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <main className="mx-auto min-h-screen max-w-[430px] px-5 pb-10 pt-8">
      <div className="mb-6">
        <div className="text-phase mb-2 text-[var(--teal)]">Rhythmus</div>
        <h1 className="font-display text-5xl leading-none text-[var(--foreground)]">Dein Zeitfenster.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Der Screen ist jetzt eingebaut. Trainingstage und Uhrzeit kommen direkt aus Supabase.
        </p>
      </div>

      <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--teal)] text-2xl text-white">⏰</div>
          <div>
            <div className="font-semibold text-[var(--text-primary)]">Geplanter Rhythmus</div>
            <div className="text-sm text-[var(--text-secondary)]">{schedule?.timezone ?? 'Europe/Berlin'}</div>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {WEEKDAYS.map(day => {
            const active = schedule?.days?.includes(day.value) ?? false
            return (
              <div
                key={day.value}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={{
                  background: active ? 'var(--teal-light)' : 'var(--sand)',
                  color: active ? 'var(--teal)' : 'var(--text-secondary)',
                }}
              >
                {day.label}
              </div>
            )
          })}
        </div>
        <div className="rounded-[16px] bg-[var(--sand)] px-4 py-3 text-sm text-[var(--text-primary)]">
          Erinnerung um {schedule?.notify_time?.slice(0, 5) ?? '07:30'} Uhr
        </div>
      </div>
    </main>
  )
}
