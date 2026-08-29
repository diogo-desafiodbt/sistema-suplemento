import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { PedidosActions } from '@/components/admin/PedidosActions'
import { exigirAdmin } from '@/lib/auth/admin'
import { asNumber, getSql } from '@/lib/db'

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

export default async function AdminPedidosNucleoPage() {
  await exigirAdmin()

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
    <>
      <CabecaDePagina
        trilha="Operações"
        titulo="Pedidos"
        acao={
          <span className="admin-sub admin-num">
            {orderList.length} {orderList.length === 1 ? 'pedido' : 'pedidos'}
          </span>
        }
      />
      <PedidosActions orders={orderList} />
    </>
  )
}
