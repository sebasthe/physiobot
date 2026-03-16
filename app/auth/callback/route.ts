import { createClient } from '@/lib/supabase/server'
import { enforceRetention } from '@/lib/privacy/retention'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { data } = await supabase.auth.exchangeCodeForSession(code)
    const userId = data.user?.id ?? data.session?.user?.id
    if (userId) {
      void enforceRetention(userId).catch(() => undefined)
    }
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}
