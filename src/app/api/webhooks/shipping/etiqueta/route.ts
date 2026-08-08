import { type NextRequest, NextResponse } from 'next/server'
import { isBearerOrQueryTokenAuthorized } from '@/lib/security/token'
import { summarizeShippingWebhookPayload } from '@/lib/security/webhook-payload'
import { notifyShippingUpdate } from '@/lib/shipping/notify'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WebhookEtiquetaPayload } from '@/types/shipping'

export async function POST(request: NextRequest) {
  if (
    !isBearerOrQueryTokenAuthorized(request, process.env.SHIPPING_WEBHOOK_TOKEN)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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
        payload: summarizeShippingWebhookPayload(payload),
        processed: false,
      })
      .select('id')
      .single()

    const idReq = payload.id_requisicao
    if (!idReq) {
      console.error(
        'webhook etiqueta sem id_requisicao',
        summarizeShippingWebhookPayload(payload),
      )
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
      await admin
        .from('webhook_logs')
        .update({ processed: true })
        .eq('id', log.id)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('webhook shipping/etiqueta error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    )
  }
}
