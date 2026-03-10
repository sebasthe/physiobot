import { redirect } from 'next/navigation'
import TransitionLink from '@/components/navigation/TransitionLink'
import { createClient } from '@/lib/supabase/server'
import type { Schedule } from '@/lib/types'
import SettingsClient from './SettingsClient'

interface PhysioInfo {
  id: string
  name: string | null
  address: string | null
}

interface ProfileWithActivePlan {
  name: string | null
  active_plan_id: string | null
  training_plans?: {
    source: 'ai' | 'physio'
    created_by: string | null
  } | null
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: schedule }, { data: relation }] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, active_plan_id, training_plans!fk_active_plan(source, created_by)')
      .eq('id', user.id)
      .single(),
    supabase.from('schedules').select('days, notify_time, timezone').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('physio_patients')
      .select('physio_id')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const typedProfile = profile as ProfileWithActivePlan | null
  if (!typedProfile) redirect('/dashboard')

  let physioInfo: PhysioInfo | null = null
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
  const activePlan = typedProfile.training_plans
  if (typedProfile.active_plan_id && activePlan) {
    isSelfCreatedPlan = activePlan.source === 'ai' || activePlan.created_by === user.id
  }

  return (
    <main className="vital-gradient min-h-screen pb-12 lg:min-h-full">
      <div className="px-6 pt-12 md:px-8 md:pb-8 lg:px-10 lg:pb-10 xl:px-12 xl:pt-14">
        <div className="mb-10 md:flex md:items-end md:justify-between md:gap-8">
          <div>
            <TransitionLink href="/dashboard" className="mb-8 inline-flex items-center gap-2 p-0 text-sm font-semibold text-[var(--accent)] transition-colors hover:text-[color:rgba(42,157,138,0.8)]">
              ← Zurück zum Dashboard
            </TransitionLink>
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.28em] text-[rgba(42,157,138,0.6)]">Einstellungen</span>
            <h1 className="font-display text-6xl uppercase tracking-tight text-white">Dein Profil.</h1>
            <p className="mt-2 text-sm text-white/40">
              Trainingstage, Erinnerungszeit und Kontodaten verwalten.
            </p>
          </div>
          <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 px-5 py-4 text-xs uppercase tracking-[0.18em] text-white/45 md:mt-0 md:max-w-xs">
            Desktop bündelt die Einstellungen in einem zweispaltigen Workspace.
          </div>
        </div>

        <SettingsClient
          userId={user.id}
          initialEmail={user.email ?? ''}
          initialName={typedProfile.name ?? ''}
          initialSchedule={(schedule as Schedule | null) ?? null}
          physioInfo={physioInfo}
          isSelfCreatedPlan={isSelfCreatedPlan}
        />
      </div>
    </main>
  )
}
