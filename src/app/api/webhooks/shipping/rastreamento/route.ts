import { type NextRequest, NextResponse } from 'next/server'
import { isBearerOrQueryTokenAuthorized } from '@/lib/security/token'
import { summarizeShippingWebhookPayload } from '@/lib/security/webhook-payload'
import { mergeTrackingEvents } from '@/lib/shipping/create-label'
import {
  getNewTrackingEvents,
  notifyNewTrackingEvents,
} from '@/lib/shipping/notify'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WebhookRastreamentoPayload } from '@/types/shipping'

export async function POST(request: NextRequest) {
  if (
    !isBearerOrQueryTokenAuthorized(request, process.env.SHIPPING_WEBHOOK_TOKEN)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      payload: summarizeShippingWebhookPayload(payload),
      processed: false,
    })
    .select('id')
    .single()

  try {
    const eventos = payload.eventos ?? []
    const idReq = eventos.find((e) => e.id_requisicao)?.id_requisicao

    if (!idReq) {
      console.error(
        'webhook rastreamento sem id_requisicao',
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
      console.error('Pedido não encontrado para rastreio', idReq)
      return NextResponse.json({ ok: true })
    }

    // Persiste antes de notificar — o painel não pode ficar sem o evento se o
    // e-mail/claim já tiverem sido concluídos. notifyShippingUpdate é
    // idempotente por (order_id, event_id); no retry reenviamos só o que ainda
    // não tem completed_at (passamos o payload inteiro, não só "novos" vs JSON).
    const merged = mergeTrackingEvents(
      order.shipping_json,
      eventos as unknown as Array<Record<string, unknown>>,
    )

    const updates: Record<string, unknown> = { shipping_json: merged }
    if (eventos.some((e) => e.finalizado === 1)) {
      updates.status = 'delivered'
    }

    const { error: updateError } = await admin
      .from('orders')
      .update(updates)
      .eq('id', order.id)

    if (updateError) {
      throw new Error(
        `webhook rastreamento: falha ao persistir shipping_json: ${updateError.message}`,
      )
    }

    // Preferir eventos ainda ausentes no JSON; se o merge já rodou num retry
    // anterior, notifica pelo payload (claims pulam o que já foi enviado).
    const newEvents = getNewTrackingEvents(order.shipping_json, eventos)
    await notifyNewTrackingEvents(
      admin,
      order.id,
      newEvents.length > 0 ? newEvents : eventos,
    )

    if (log?.id) {
      await admin
        .from('webhook_logs')
        .update({ processed: true })
        .eq('id', log.id)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('webhook shipping/rastreamento error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    )
  }
}
