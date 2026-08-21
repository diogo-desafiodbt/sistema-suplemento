import { NextResponse } from 'next/server'
import {
  isoDate,
  requirePacienteSession,
} from '@/app/api/contrato/paciente/_session'
import { asNumber, getSql } from '@/lib/db'

type OrderItem = {
  id: string
  quantity: number
  unit_price: number
  products: { name: string } | null
}

export async function POST() {
  const session = await requirePacienteSession()
  if ('response' in session) return session.response

  try {
    const sql = getSql()
    const orders = await sql<
      {
        id: string
        status: string
        created_at: string | Date
        tracking_code: string | null
        order_items: OrderItem[]
      }[]
    >`
      SELECT o.id, o.status, o.created_at, o.tracking_code,
        COALESCE(it.list, '[]'::jsonb) AS order_items
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id, 'quantity', oi.quantity, 'unit_price', oi.unit_price,
          'products', CASE WHEN pr.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', pr.name) END
        ) ORDER BY oi.id) AS list
        FROM order_items oi LEFT JOIN products pr ON pr.id = oi.product_id
        WHERE oi.order_id = o.id) it ON true
      WHERE o.user_id = ${session.userId}::uuid
      ORDER BY o.created_at DESC
    `

    return NextResponse.json({
      pedidos: orders.map((order) => ({
        id: order.id,
        status: order.status,
        created_at: isoDate(order.created_at),
        tracking_code: order.tracking_code,
        itens: (order.order_items ?? []).map((item) => ({
          id: item.id,
          quantity: asNumber(item.quantity),
          unit_price: asNumber(item.unit_price),
          products: item.products,
        })),
      })),
    })
  } catch (error) {
    console.error('contrato/paciente/meus-pedidos:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
