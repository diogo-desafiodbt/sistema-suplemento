import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { isBearerTokenAuthorizedComTransicao } from '@/lib/security/token'
import { summarizeShippingWebhookPayload } from '@/lib/security/webhook-payload'
import { notifyShippingUpdate } from '@/lib/shipping/notify'
import type { WebhookEtiquetaPayload } from '@/types/shipping'

export async function POST(request: NextRequest) {
  // Só header Authorization: token em query string vaza para log de acesso,
  // proxy e referrer. O ..._ANTERIOR mantém a credencial antiga válida enquanto
  // a Envie Agora não atualiza o painel; apagar essa variável fecha a janela.
  if (
    !isBearerTokenAuthorizedComTransicao(
      request,
      process.env.SHIPPING_WEBHOOK_TOKEN,
      process.env.SHIPPING_WEBHOOK_TOKEN_ANTERIOR,
    )
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sql = getSql()
    let payload: WebhookEtiquetaPayload

    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ ok: true })
    }

    const logRows = await sql<{ id: string }[]>`
      INSERT INTO webhook_logs (source, event_type, payload, processed)
      VALUES (
        'shipping',
        'etiqueta_gerada',
        ${sql.json(summarizeShippingWebhookPayload(payload) as never)},
        false
      )
      RETURNING id
    `
    const log = logRows[0]
    if (!log) {
      throw new Error('webhook etiqueta: insert webhook_logs sem id')
    }

    const idReq = payload.id_requisicao
    if (!idReq) {
      console.error(
        'webhook etiqueta sem id_requisicao',
        summarizeShippingWebhookPayload(payload),
      )
      return NextResponse.json({ ok: true })
    }

    const orderRows = await sql<{ id: string }[]>`
      SELECT id FROM orders
      WHERE shipping_request_id = ${idReq}
      LIMIT 1
    `
    const order = orderRows[0] ?? null

    if (!order) {
      console.error('Pedido não encontrado para id_requisicao', idReq)
      return NextResponse.json({ ok: true })
    }

    const patch = { ...payload, etiqueta_webhook: payload }
    await sql`
      UPDATE orders
      SET
        tracking_code = ${payload.numero_etiqueta},
        status = 'dispatched',
        shipping_json = COALESCE(shipping_json, '{}'::jsonb) || ${sql.json(patch as never)}
      WHERE id = ${order.id}::uuid
    `

    await notifyShippingUpdate({
      orderId: order.id,
      eventId: 'etiqueta',
      kind: 'dispatched',
      trackingCode: payload.numero_etiqueta,
    })

    await sql`
      UPDATE webhook_logs SET processed = true WHERE id = ${log.id}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('webhook shipping/etiqueta error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    )
  }
}
