import { redirect } from 'next/navigation'
import { perguntarAoNucleo } from '@/lib/contrato/nucleo'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/suplementos/login')

  const papel = await perguntarAoNucleo<{
    role: string
    full_name: string | null
    client_code: string | null
  }>('meu-papel')

  if (!papel) redirect('/suplementos/login')

  if (papel.role === 'professional') redirect('/suplementos/profissional/fila')
  if (papel.role === 'admin') redirect('/suplementos/admin/usuarios')

  redirect('/suplementos/dashboard/pedidos')
}
