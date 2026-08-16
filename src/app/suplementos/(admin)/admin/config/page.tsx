import { redirect } from 'next/navigation'
import { ConfigClient } from '@/components/admin/ConfigClient'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
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

  const profile = await getUserProfile(user.id)

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const sql = getSql()
  const configs = await sql<ConfigRow[]>`
    SELECT key, value, description FROM system_config
    ORDER BY key ASC
  `

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

      <ConfigClient configs={configs} />
    </main>
  )
}
