import { redirect } from 'next/navigation'
import { ConfigClient } from '@/components/admin/ConfigClient'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type ConfigRow = {
  key: string
  value: string
  description: string | null
}

export default async function AdminConfigPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const { data: configs } = await admin
    .from('system_config')
    .select('key, value, description')
    .order('key', { ascending: true })

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
          Sistema
        </p>
        <h1 className="text-2xl font-bold text-[#13244f]">Configurações</h1>
        <p className="text-sm text-gray-400 mt-1">
          Valores operacionais editáveis sem redeploy.
        </p>
      </div>

      <ConfigClient configs={(configs ?? []) as ConfigRow[]} />
    </main>
  )
}
