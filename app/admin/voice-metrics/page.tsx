import { redirect } from 'next/navigation'
import { getMessages } from '@/lib/i18n/messages'
import { getRequestLanguage } from '@/lib/i18n/server'
import { toLocaleTag } from '@/lib/i18n/config'
import { createClient } from '@/lib/supabase/server'

interface TelemetryEventRow {
  event_type: string
  payload: Record<string, unknown> | null
  created_at: string
}

export default async function VoiceMetricsPage() {
  const locale = await getRequestLanguage()
  const messages = getMessages(locale)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('voice_telemetry_events')
    .select('event_type, payload, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1000)

  const events = (data ?? []) as TelemetryEventRow[]
  const turnMetricEvents = events.filter(event => event.event_type === 'turn_metrics')
  const turnTimes = turnMetricEvents
    .map(event => readNumber(event.payload?.totalTurnTime))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)

  const avgTurnTime = turnTimes.length > 0
    ? Math.round(turnTimes.reduce((sum, value) => sum + value, 0) / turnTimes.length)
    : 0
  const p95TurnTime = turnTimes.length > 0
    ? turnTimes[Math.min(turnTimes.length - 1, Math.floor(turnTimes.length * 0.95))]
    : 0
  const interruptRate = formatRate(events, event => event.event_type === 'interrupt')
  const fallbackRate = formatRate(events, event => event.event_type === 'fallback_mode')
  const errorRate = formatRate(events, event => event.event_type === 'voice_error')
  const timedOutTurns = turnMetricEvents.filter(event => event.payload?.llmTimedOut === true).length
  const directCommands = turnMetricEvents.filter(event => event.payload?.skippedReason === 'command').length

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.35em]" style={{ color: 'var(--primary)' }}>
          {messages.admin.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{messages.admin.title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/70">
          {messages.admin.copy}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={messages.admin.totalEvents} value={events.length} />
        <MetricCard label={messages.admin.turnMetrics} value={turnMetricEvents.length} />
        <MetricCard label={messages.admin.avgTurnTime} value={`${avgTurnTime}ms`} />
        <MetricCard label={messages.admin.p95TurnTime} value={`${p95TurnTime}ms`} />
        <MetricCard label={messages.admin.interruptRate} value={interruptRate} />
        <MetricCard label={messages.admin.fallbackRate} value={fallbackRate} />
        <MetricCard label={messages.admin.errorRate} value={errorRate} />
        <MetricCard label={messages.admin.llmTimeouts} value={timedOutTurns} />
        <MetricCard label={messages.admin.directCommands} value={directCommands} />
      </section>

      <section className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-medium">{messages.admin.recentTelemetry}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-white/60">
              <tr>
                <th className="px-5 py-3 font-medium">{messages.admin.created}</th>
                <th className="px-5 py-3 font-medium">{messages.admin.type}</th>
                <th className="px-5 py-3 font-medium">{messages.admin.summary}</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 25).map(event => (
                <tr key={`${event.event_type}:${event.created_at}`} className="border-t border-white/10">
                  <td className="px-5 py-3 text-white/70">{new Date(event.created_at).toLocaleString(toLocaleTag(locale))}</td>
                  <td className="px-5 py-3">{event.event_type}</td>
                  <td className="px-5 py-3 text-white/70">{summarizePayload(event, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-white/45">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </article>
  )
}

function summarizePayload(event: TelemetryEventRow, locale: 'de' | 'en'): string {
  const messages = getMessages(locale)
  if (event.event_type === 'turn_metrics') {
    const totalTurnTime = readNumber(event.payload?.totalTurnTime)
    const category = typeof event.payload?.utteranceCategory === 'string' ? event.payload.utteranceCategory : 'unknown'
    const skippedReason = typeof event.payload?.skippedReason === 'string' ? event.payload.skippedReason : null
    const timedOut = event.payload?.llmTimedOut === true ? messages.admin.timeout : null

    return [category, skippedReason, timedOut, totalTurnTime !== null ? `${totalTurnTime}ms` : messages.admin.noAudio]
      .filter(Boolean)
      .join(' · ')
  }

  return JSON.stringify(event.payload ?? {})
}

function formatRate(events: TelemetryEventRow[], predicate: (event: TelemetryEventRow) => boolean): string {
  if (events.length === 0) {
    return '0%'
  }

  const matching = events.filter(predicate).length
  return `${Math.round((matching / events.length) * 100)}%`
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
