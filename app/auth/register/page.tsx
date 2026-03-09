import { redirect } from 'next/navigation'
import RegisterPageClient from '@/components/auth/RegisterPageClient'
import { createClient } from '@/lib/supabase/server'

export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return <RegisterPageClient />
}
