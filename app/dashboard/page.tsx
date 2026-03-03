import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'
import type { Exercise } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Check health profile exists
  const { data: healthProfile } = await supabase
    .from('health_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!healthProfile) redirect('/onboarding/personality')

  // Get profile with active plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_plan_id')
    .eq('id', user.id)
    .single()

  let exercises: Exercise[] = []
  if (profile?.active_plan_id) {
    const { data: plan } = await supabase
      .from('training_plans')
      .select('exercises')
      .eq('id', profile.active_plan_id)
      .single()
    exercises = (plan?.exercises as Exercise[]) ?? []
  }

  return (
    <DashboardClient
      hasActivePlan={!!profile?.active_plan_id}
      initialExercises={exercises}
    />
  )
}
