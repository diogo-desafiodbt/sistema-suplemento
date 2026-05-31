import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/admin/AdminNav'

type UserRow = {
  id: string
  full_name: string
  email: string
  client_code: string
  role: string
  created_at: string
  user_entitlements: { product_key: string; status: string }[]
  subscriptions: { plan_type: string; status: string }[]
}

export default async function AdminUsuariosPage() {
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

  const { data: users } = await admin
    .from('users')
    .select(`
      id, full_name, email, client_code, role, created_at,
      user_entitlements ( product_key, status ),
      subscriptions ( plan_type, status )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const userList = (users ?? []) as unknown as UserRow[]

  return (
    <div className="min-h-screen bg-[#f5f0eb]">

      {/* Header */}
      <header className="bg-[#13244f] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <img src="/logo-branca.png" alt="Desafio Diabetes" className="h-7 w-auto" />
          <span className="text-white/40 text-sm">Admin</span>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-white/60 hover:text-white transition">Sair</button>
        </form>
      </header>

      {/* Nav */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <AdminNav active="usuarios" />
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Gestão</p>
            <h1 className="text-2xl font-bold text-[#13244f]">Usuários</h1>
          </div>
          <span className="text-sm text-gray-400">{userList.length} registros</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Paciente</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Código</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Role</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Plano</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {userList.map(u => {
                const activeSub = u.subscriptions?.find(s => s.status === 'active')
                const roleBg: Record<string, string> = {
                  patient: 'bg-gray-100 text-gray-600',
                  professional: 'bg-blue-50 text-blue-700',
                  admin: 'bg-[#13244f]/10 text-[#13244f]',
                }
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-[#f5f0eb]/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#13244f]">{u.full_name}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{u.email}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-gray-400">{u.client_code}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${roleBg[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {activeSub ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700">
                          {activeSub.plan_type}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
