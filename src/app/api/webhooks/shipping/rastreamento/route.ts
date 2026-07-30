import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mergeTrackingEvents } from '@/lib/shipping/create-label'
import type { WebhookRastreamentoPayload } from '@/types/shipping'

export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  let payload: WebhookRastreamentoPayload

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const { data: log } = await admin
    .from('webhook_logs')
    .insert({
      source: 'shipping',
      event_type: 'rastreamento_atualizado',
      payload,
      processed: false,
    })
    .select('id')
    .single()

  try {
    const eventos = payload.eventos ?? []
    const idReq = eventos.find(e => e.id_requisicao)?.id_requisicao

    if (!idReq) {
      console.error('webhook rastreamento sem id_requisicao', payload)
      return NextResponse.json({ ok: true })
    }

    const { data: order } = await admin
      .from('orders')
      .select('id, shipping_json')
      .eq('shipping_request_id', idReq)
      .maybeSingle()

    if (!order) {
      console.error('Pedido não encontrado para rastreio', idReq)
      return NextResponse.json({ ok: true })
    }

    const merged = mergeTrackingEvents(
      order.shipping_json,
      eventos as unknown as Array<Record<string, unknown>>
    )

    const updates: Record<string, unknown> = { shipping_json: merged }
    if (eventos.some(e => e.finalizado === 1)) {
      updates.status = 'delivered'
    }

    await admin.from('orders').update(updates).eq('id', order.id)

    if (log?.id) {
      await admin.from('webhook_logs').update({ processed: true }).eq('id', log.id)
    }
  } catch (error) {
    console.error('webhook shipping/rastreamento error:', error)
  }

  return NextResponse.json({ ok: true })
}
