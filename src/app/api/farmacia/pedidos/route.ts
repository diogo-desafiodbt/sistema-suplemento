import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { isFarmaciaAuthorized, parseDateRange } from '@/lib/pharmacy/pull-api'

type OrderRow = {
  id: string
  created_at: Date | string
  status: string
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

export async function GET(request: NextRequest) {
  if (!isFarmaciaAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const range = parseDateRange(request.nextUrl.searchParams)
    if (range.invalid) {
      return NextResponse.json({ error: range.invalid }, { status: 400 })
    }

    const sql = getSql()
    const gte = range.gte ?? null
    const lt = range.lt ?? null

    const orders = await sql<OrderRow[]>`
      SELECT o.id, o.created_at, o.status
      FROM orders o
      JOIN subscriptions s ON s.id = o.subscription_id
      JOIN protocols p ON p.id = s.protocol_id
      WHERE p.status = 'signed'
        AND (${gte}::timestamptz IS NULL OR o.created_at >= ${gte}::timestamptz)
        AND (${lt}::timestamptz IS NULL OR o.created_at < ${lt}::timestamptz)
      ORDER BY o.created_at ASC
    `

    const result = orders.map((o) => ({
      numero_pedido: o.id,
      data_compra: toIso(o.created_at),
      status: o.status,
    }))

    await sql`
      INSERT INTO pharmacy_api_logs (endpoint, query_params, order_ids_returned)
      VALUES (
        'listagem',
        ${sql.json(range.params)},
        ${sql.json(result.map((r) => r.numero_pedido))}
      )
    `

    return NextResponse.json(result)
  } catch (error) {
    console.error('farmacia/pedidos error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
