import MemoryClient from 'mem0ai'
import { NextResponse } from 'next/server'
import { deleteUserAppData } from '@/lib/privacy/account-delete'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

interface Mem0Client {
  deleteAll: (options: { user_id: string }) => Promise<unknown>
}

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
}) as unknown as Mem0Client

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await mem0.deleteAll({ user_id: user.id }).catch(() => undefined)

  const adminClient = createAdminClient()
  let deletedAuthUser = false
  let authDeletionError: string | null = null

  if (adminClient) {
    const { error } = await adminClient.auth.admin.deleteUser(user.id)
    deletedAuthUser = !error
    authDeletionError = error?.message ?? null
  } else {
    authDeletionError = 'SUPABASE_SECRET_KEY ist nicht konfiguriert.'
  }

  if (!deletedAuthUser) {
    const cleanupClient = adminClient ?? supabase
    const { errors } = await deleteUserAppData(cleanupClient, user.id)

    await supabase.auth.signOut().catch(() => undefined)

    if (errors.length > 0) {
      console.error('Account deletion cleanup failed', { userId: user.id, errors })
      return NextResponse.json(
        { error: 'Kontodaten konnten nicht vollstaendig geloescht werden.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        error: authDeletionError
          ? `Konto konnte nicht vollstaendig geloescht werden. ${authDeletionError}`
          : 'Konto konnte nicht vollstaendig geloescht werden.',
        deletedAuthUser: false,
      },
      { status: 503 }
    )
  }

  await supabase.auth.signOut().catch(() => undefined)

  return NextResponse.json({
    success: true,
    deletedAuthUser,
  })
}
