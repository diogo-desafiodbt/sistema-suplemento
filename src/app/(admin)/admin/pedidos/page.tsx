import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { AdminNav } from '@/components/admin/AdminNav'

type OrderRow = {
  id: string
  status: string
  created_at: string
  tracking_code: string | null
  total_amount: number
  users: {
    full_name: string
    email: string
    client_code: string
  } | null
}

export default async function AdminPedidosPage() {
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

  const { data: orders } = await admin
    .from('orders')
    .select(`
      id, status, created_at, tracking_code, total_amount,
      users ( full_name, email, client_code )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const orderList = (orders ?? []) as unknown as OrderRow[]

  const statusLabel: Record<string, string> = {
    pending: 'Aguardando',
    sent_to_pharmacy: 'Na farmácia',
    dispatched: 'A caminho',
    delivered: 'Entregue',
    failed: 'Falhou',
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    sent_to_pharmacy: 'bg-blue-100 text-blue-700',
    dispatched: 'bg-amber-100 text-amber-700',
    delivered: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-semibold">Admin</h1>
          <AdminNav active="pedidos" />
        </div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">Sair</button>
        </form>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <h2 className="text-xl font-semibold mb-4">Pedidos</h2>
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Paciente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Valor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Rastreio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orderList.map(order => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{order.users?.full_name}</p>
                    <p className="text-gray-400 text-xs">{order.users?.client_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`${statusColor[order.status]} border-0 text-xs`}>
                      {statusLabel[order.status] ?? order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    R$ {order.total_amount?.toFixed(2).replace('.', ',')}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {order.tracking_code ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
