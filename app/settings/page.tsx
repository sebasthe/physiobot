import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Schedule } from '@/lib/types'
import SettingsClient from './SettingsClient'

interface PhysioInfo {
  id: string
  name: string | null
  address: string | null
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: schedule }] = await Promise.all([
    supabase.from('profiles').select('name, active_plan_id').eq('id', user.id).single(),
    supabase.from('schedules').select('days, notify_time, timezone').eq('user_id', user.id).maybeSingle(),
  ])

  if (!profile) redirect('/dashboard')

  let physioInfo: PhysioInfo | null = null
  const { data: relation } = await supabase
    .from('physio_patients')
    .select('physio_id')
    .eq('patient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (relation?.physio_id) {
    const { data: physioProfile } = await supabase
      .from('profiles')
      .select('id, name, address')
      .eq('id', relation.physio_id)
      .maybeSingle()

    if (physioProfile) {
      physioInfo = {
        id: physioProfile.id,
        name: physioProfile.name ?? null,
        address: physioProfile.address ?? null,
      }
    }
  }

  let isSelfCreatedPlan = !physioInfo
  if (profile.active_plan_id) {
    const { data: activePlan } = await supabase
      .from('training_plans')
      .select('source, created_by')
      .eq('id', profile.active_plan_id)
      .maybeSingle()

    if (activePlan) {
      isSelfCreatedPlan = activePlan.source === 'ai' || activePlan.created_by === user.id
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[430px] px-5 pb-12 pt-8">
      <div className="mb-6">
        <Link href="/dashboard" className="mb-4 inline-flex text-sm font-semibold text-[var(--teal)]">
          ← Zurück zum Dashboard
        </Link>
        <div className="text-phase mb-2 text-[var(--teal)]">Einstellungen</div>
        <h1 className="font-display text-5xl leading-none text-[var(--foreground)]">Dein Profil.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Trainingstage, Erinnerungszeit und Kontodaten verwalten.
        </p>
      </div>

      <SettingsClient
        userId={user.id}
        initialEmail={user.email ?? ''}
        initialName={profile.name ?? ''}
        initialSchedule={(schedule as Schedule | null) ?? null}
        physioInfo={physioInfo}
        isSelfCreatedPlan={isSelfCreatedPlan}
      />
    </main>
  )
}
