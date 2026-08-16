import { redirect } from 'next/navigation'
import { PedidosActions } from '@/components/admin/PedidosActions'
import { asNumber, getSql } from '@/lib/db'
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

  const sql = getSql()
  const orders = await sql<OrderRow[]>`
    SELECT o.id, o.status, o.created_at, o.tracking_code, o.total_amount,
           o.shipping_request_id,
      CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
        'full_name', u.full_name, 'email', u.email, 'client_code', u.client_code) END AS users
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
    LIMIT 50
  `

  const orderList = orders.map((o) => ({
    ...o,
    total_amount: asNumber(o.total_amount),
  }))

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
