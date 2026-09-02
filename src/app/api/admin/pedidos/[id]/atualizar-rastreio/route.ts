import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'
import { mergeTrackingEvents } from '@/lib/shipping/tracking-events'
import {
  getRastreamento,
  getRastreamentoPorObjeto,
} from '@/lib/shipping/envie-agora/rastreamento'
import {
  getNewTrackingEvents,
  notifyNewTrackingEvents,
} from '@/lib/shipping/notify'

async function requireAdmin() {
  const sessao = await sessaoAtual()
  if (!sessao) return null
  const profile = await getUserProfile(sessao.userId)
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
        tracking_code: string | null
        shipping_json: unknown
      }[]
    >`
      SELECT id, shipping_request_id, tracking_code, shipping_json FROM orders
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    const order = orderRows[0] ?? null

    // Dois caminhos desde 02/09/2026. Etiqueta emitida por nós tem o
    // identificador da requisição. Etiqueta emitida pela Miligrama dentro da
    // nossa conta não tem — e aí o elo é o número do objeto, que a farmácia
    // nos conta quando despacha.
    if (!order?.shipping_request_id && !order?.tracking_code) {
      return NextResponse.json(
        { error: 'Pedido sem etiqueta e sem número de objeto — nada a rastrear ainda.' },
        { status: 400 },
      )
    }

    const tracking = order.shipping_request_id
      ? await getRastreamento(order.shipping_request_id)
      : await getRastreamentoPorObjeto(order.tracking_code as string)
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
