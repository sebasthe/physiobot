import { redirect } from 'next/navigation'
import LoginPageClient from '@/components/auth/LoginPageClient'
import { createClient } from '@/lib/supabase/server'

export default async function LoginPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return <LoginPageClient />
}
