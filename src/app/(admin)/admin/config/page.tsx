import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/admin/AdminNav'
import { ConfigClient } from '@/components/admin/ConfigClient'

type ConfigRow = {
  key: string
  value: string
  description: string | null
}

export default async function AdminConfigPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: configs } = await admin
    .from('system_config')
    .select('key, value, description')
    .order('key', { ascending: true })

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-[#13244f] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <img src="/logo-branca.png" alt="Desafio Diabetes" className="h-7 w-auto" />
          <span className="text-white/40 text-sm">Admin</span>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-white/60 hover:text-white transition">Sair</button>
        </form>
      </header>

      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <AdminNav active="config" />
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Sistema</p>
          <h1 className="text-2xl font-bold text-[#13244f]">Configurações</h1>
          <p className="text-sm text-gray-400 mt-1">Valores operacionais editáveis sem redeploy.</p>
        </div>

        <ConfigClient configs={(configs ?? []) as ConfigRow[]} />
      </main>
    </div>
  )
}
