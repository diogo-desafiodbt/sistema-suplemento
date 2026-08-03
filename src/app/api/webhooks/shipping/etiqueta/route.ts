import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyShippingUpdate } from '@/lib/shipping/notify'
import type { WebhookEtiquetaPayload } from '@/types/shipping'

export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  let payload: WebhookEtiquetaPayload

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const { data: log } = await admin
    .from('webhook_logs')
    .insert({
      source: 'shipping',
      event_type: 'etiqueta_gerada',
      payload,
      processed: false,
    })
    .select('id')
    .single()

  try {
    const idReq = payload.id_requisicao
    if (!idReq) {
      console.error('webhook etiqueta sem id_requisicao', payload)
      return NextResponse.json({ ok: true })
    }

    const { data: order } = await admin
      .from('orders')
      .select('id, shipping_json')
      .eq('shipping_request_id', idReq)
      .maybeSingle()

    if (!order) {
      console.error('Pedido não encontrado para id_requisicao', idReq)
      return NextResponse.json({ ok: true })
    }

    const prev =
      order.shipping_json && typeof order.shipping_json === 'object'
        ? (order.shipping_json as Record<string, unknown>)
        : {}

    await admin
      .from('orders')
      .update({
        tracking_code: payload.numero_etiqueta,
        status: 'dispatched',
        shipping_json: { ...prev, ...payload, etiqueta_webhook: payload },
      })
      .eq('id', order.id)

    await notifyShippingUpdate(admin, {
      orderId: order.id,
      eventId: 'etiqueta',
      kind: 'dispatched',
      trackingCode: payload.numero_etiqueta,
    })

    if (log?.id) {
      await admin.from('webhook_logs').update({ processed: true }).eq('id', log.id)
    }
  } catch (error) {
    console.error('webhook shipping/etiqueta error:', error)
  }

  return NextResponse.json({ ok: true })
}
