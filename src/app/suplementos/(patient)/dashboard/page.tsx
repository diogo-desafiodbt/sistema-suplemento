import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/suplementos/login')

  const profile = await getUserProfile(user.id)

  if (profile?.role === 'professional')
    redirect('/suplementos/profissional/fila')
  if (profile?.role === 'admin') redirect('/suplementos/admin/usuarios')

  redirect('/suplementos/dashboard/pedidos')
}
