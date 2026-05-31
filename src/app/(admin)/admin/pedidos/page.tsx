import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
    pending: 'bg-gray-100 text-gray-600',
    sent_to_pharmacy: 'bg-blue-50 text-blue-700',
    dispatched: 'bg-amber-50 text-amber-700',
    delivered: 'bg-green-50 text-green-700',
    failed: 'bg-red-50 text-red-700',
  }

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
        <AdminNav active="pedidos" />
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Operações</p>
            <h1 className="text-2xl font-bold text-[#13244f]">Pedidos</h1>
          </div>
          <span className="text-sm text-gray-400">{orderList.length} registros</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Paciente</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Valor</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Rastreio</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Data</th>
              </tr>
            </thead>
            <tbody>
              {orderList.map(order => (
                <tr key={order.id} className="border-b border-gray-50 hover:bg-[#f5f0eb]/50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[#13244f]">{order.users?.full_name}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{order.users?.client_code}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColor[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabel[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-semibold text-[#13244f]">
                    R$ {order.total_amount?.toFixed(2).replace('.', ',')}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-400">
                    {order.tracking_code ?? '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
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
