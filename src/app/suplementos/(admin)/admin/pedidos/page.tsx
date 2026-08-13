import { redirect } from 'next/navigation'
import { PedidosActions } from '@/components/admin/PedidosActions'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type OrderRow = {
  id: string
  status: string
  created_at: string
  tracking_code: string | null
  total_amount: number
  shipping_request_id: string | null
  users: {
    full_name: string
    email: string
    client_code: string
  } | null
}

export default async function AdminPedidosPage() {
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

  const { data: orders } = await admin
    .from('orders')
    .select(`
      id, status, created_at, tracking_code, total_amount, shipping_request_id,
      users ( full_name, email, client_code )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const orderList = (orders ?? []) as unknown as OrderRow[]

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
            Operações
          </p>
          <h1 className="text-2xl font-bold text-[#13244f]">Pedidos</h1>
        </div>
        <span className="text-sm text-gray-400">
          {orderList.length} registros
        </span>
      </div>

      <PedidosActions orders={orderList} />
    </main>
  )
}
