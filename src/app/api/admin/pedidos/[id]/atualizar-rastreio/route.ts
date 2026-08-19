import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import { mergeTrackingEvents } from '@/lib/shipping/tracking-events'
import { getRastreamento } from '@/lib/shipping/envie-agora/rastreamento'
import {
  getNewTrackingEvents,
  notifyNewTrackingEvents,
} from '@/lib/shipping/notify'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const profile = await getUserProfile(user.id)
  if (profile?.role !== 'admin') return null
  return true
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ok = await requireAdmin()
    if (!ok) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await context.params
    const sql = getSql()
    const orderRows = await sql<
      {
        id: string
        shipping_request_id: string | null
        shipping_json: unknown
      }[]
    >`
      SELECT id, shipping_request_id, shipping_json FROM orders
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    const order = orderRows[0] ?? null

    if (!order?.shipping_request_id) {
      return NextResponse.json(
        { error: 'Pedido sem shipping_request_id' },
        { status: 400 },
      )
    }

    const tracking = await getRastreamento(order.shipping_request_id)
    const eventos = tracking.eventos ?? []

    const merged = mergeTrackingEvents(
      order.shipping_json,
      eventos as unknown as Array<Record<string, unknown>>,
    )

    const delivered = eventos.some((e) => e.finalizado === 1)
    if (delivered) {
      await sql`
        UPDATE orders
        SET
          shipping_json = ${sql.json(merged as never)},
          status = 'delivered'
        WHERE id = ${id}::uuid
      `
    } else {
      await sql`
        UPDATE orders
        SET shipping_json = ${sql.json(merged as never)}
        WHERE id = ${id}::uuid
      `
    }

    const newEvents = getNewTrackingEvents(order.shipping_json, eventos)
    await notifyNewTrackingEvents(
      order.id,
      newEvents.length > 0 ? newEvents : eventos,
    )

    return NextResponse.json({ ok: true, eventos: eventos.length })
  } catch (error) {
    console.error('atualizar-rastreio error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
