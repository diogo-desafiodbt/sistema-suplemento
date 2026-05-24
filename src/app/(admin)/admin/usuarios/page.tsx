import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
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

  const roleColor: Record<string, string> = {
    patient: 'bg-gray-100 text-gray-700',
    professional: 'bg-blue-100 text-blue-700',
    admin: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-semibold">Admin</h1>
          <AdminNav active="usuarios" />
        </div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">Sair</button>
        </form>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <h2 className="text-xl font-semibold mb-4">Usuários</h2>
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Paciente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Código</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Plano</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Cadastro</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {userList.map(u => {
                const activeSub = u.subscriptions?.find(s => s.status === 'active')
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.full_name}</p>
                      <p className="text-gray-400 text-xs">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.client_code}</td>
                    <td className="px-4 py-3">
                      <Badge className={`${roleColor[u.role]} border-0 text-xs`}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {activeSub ? (
                        <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                          {activeSub.plan_type}
                        </Badge>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
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
