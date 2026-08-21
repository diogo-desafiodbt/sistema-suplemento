import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  isoDate,
  requirePacienteSession,
} from '@/app/api/contrato/paciente/_session'
import { asNumber, getSql } from '@/lib/db'

const bodySchema = z.object({
  order_id: z.string().uuid(),
})

type OrderItem = {
  id: string
  quantity: number
  unit_price: number
  products: { name: string } | null
}

export async function POST(request: NextRequest) {
  const session = await requirePacienteSession()
  if ('response' in session) return session.response

  try {
    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { order_id } = parsed.data
    const sql = getSql()

    // Dono via subscriptions — nunca 403 se o id existir e for de outro.
    const orderRows = await sql<
      {
        id: string
        status: string
        created_at: string | Date
        total_amount: string | number | null
        tracking_code: string | null
        pharmacy_sent_at: string | Date | null
        shipping_quote_json: unknown
        shipping_json: unknown
        pharmacy_json: unknown
        order_items: OrderItem[]
      }[]
    >`
      SELECT o.id, o.status, o.created_at, o.total_amount, o.tracking_code,
             o.pharmacy_sent_at, o.shipping_quote_json, o.shipping_json,
             o.pharmacy_json,
        COALESCE(it.list, '[]'::jsonb) AS order_items
      FROM orders o
      JOIN subscriptions s ON s.id = o.subscription_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id, 'quantity', oi.quantity, 'unit_price', oi.unit_price,
          'products', CASE WHEN pr.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', pr.name) END
        ) ORDER BY oi.id) AS list
        FROM order_items oi LEFT JOIN products pr ON pr.id = oi.product_id
        WHERE oi.order_id = o.id) it ON true
      WHERE o.id = ${order_id}::uuid
        AND s.user_id = ${session.userId}::uuid
      LIMIT 1
    `

    const order = orderRows[0]
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }

    const shippingJson =
      order.shipping_json &&
      typeof order.shipping_json === 'object' &&
      !Array.isArray(order.shipping_json)
        ? (order.shipping_json as { eventos?: unknown[] })
        : null

    let payment_method: 'credit_card' | 'pix' | null = null
    const paymentRows = await sql<{ webhook_payload: unknown }[]>`
      SELECT pay.webhook_payload
      FROM payments pay
      JOIN subscriptions s ON s.id = pay.subscription_id
      JOIN orders o ON o.subscription_id = s.id
      WHERE o.id = ${order_id}::uuid
        AND s.user_id = ${session.userId}::uuid
      ORDER BY pay.created_at DESC
      LIMIT 1
    `
    const payload = paymentRows[0]?.webhook_payload
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>
      const charges = p.charges
      if (Array.isArray(charges) && charges[0] && typeof charges[0] === 'object') {
        const method = (charges[0] as Record<string, unknown>).payment_method
        if (method === 'credit_card' || method === 'pix') payment_method = method
      } else if (p.payment_method === 'credit_card' || p.payment_method === 'pix') {
        payment_method = p.payment_method
      }
    }

    return NextResponse.json({
      id: order.id,
      status: order.status,
      created_at: isoDate(order.created_at),
      total_amount:
        order.total_amount == null ? null : asNumber(order.total_amount),
      tracking_code: order.tracking_code,
      pharmacy_sent_at: isoDate(order.pharmacy_sent_at),
      shipping_quote_json: order.shipping_quote_json,
      pharmacy_json: order.pharmacy_json,
      payment_method,
      rastreamento: shippingJson?.eventos ?? [],
      itens: (order.order_items ?? []).map((item) => ({
        id: item.id,
        quantity: asNumber(item.quantity),
        unit_price: asNumber(item.unit_price),
        products: item.products,
      })),
    })
  } catch (error) {
    console.error('contrato/paciente/meu-pedido:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
