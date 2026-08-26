import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { isTokenDeParceiroSemCabecalho } from '@/lib/security/token'
import { summarizeShippingWebhookPayload } from '@/lib/security/webhook-payload'
import { mergeTrackingEvents } from '@/lib/shipping/tracking-events'
import {
  getNewTrackingEvents,
  notifyNewTrackingEvents,
} from '@/lib/shipping/notify'
import type { WebhookRastreamentoPayload } from '@/types/shipping'

export async function POST(request: NextRequest) {
  // Só header Authorization: token em query string vaza para log de acesso,
  // proxy e referrer. O ..._ANTERIOR mantém a credencial antiga válida enquanto
  // a Envie Agora não atualiza o painel; apagar essa variável fecha a janela.
  if (
    !isTokenDeParceiroSemCabecalho(
      request,
      process.env.SHIPPING_WEBHOOK_TOKEN,
      process.env.SHIPPING_WEBHOOK_TOKEN_ANTERIOR,
    )
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sql = getSql()
    let payload: WebhookRastreamentoPayload

    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ ok: true })
    }

    const logRows = await sql<{ id: string }[]>`
      INSERT INTO webhook_logs (source, event_type, payload, processed)
      VALUES (
        'shipping',
        'rastreamento_atualizado',
        ${sql.json(summarizeShippingWebhookPayload(payload) as never)},
        false
      )
      RETURNING id
    `
    const log = logRows[0]
    if (!log) {
      throw new Error('webhook rastreamento: insert webhook_logs sem id')
    }

    // Duas formas para o mesmo dado: a API que consultamos devolve
    // `{ eventos: [...] }` e o webhook que eles empurram manda a lista pura.
    // Aceitar só uma delas significava devolver 200 e não gravar nada — o
    // evento sumia e o cliente nunca via o rastreio andar.
    const eventos = Array.isArray(payload) ? payload : (payload.eventos ?? [])
    const idReq = eventos.find((e) => e.id_requisicao)?.id_requisicao

    if (!idReq) {
      console.error(
        'webhook rastreamento sem id_requisicao',
        summarizeShippingWebhookPayload(payload),
      )
      return NextResponse.json({ ok: true })
    }

    const orderRows = await sql<{ id: string; shipping_json: unknown }[]>`
      SELECT id, shipping_json FROM orders
      WHERE shipping_request_id = ${idReq}
      LIMIT 1
    `
    const order = orderRows[0] ?? null

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

    // `finalizado` só vem na API que consultamos; o webhook não traz. Sem uma
    // segunda forma de reconhecer a entrega, o pedido ficaria em "a caminho"
    // para sempre. A descrição é o que sobra — e é o mesmo texto que o cliente
    // lê no rastreio.
    const entregue = eventos.some(
      (e) =>
        e.finalizado === 1 ||
        /\bentregue\b/i.test(e.descricao ?? ''),
    )
    if (entregue) {
      await sql`
        UPDATE orders
        SET
          shipping_json = ${sql.json(merged as never)},
          status = 'delivered'
        WHERE id = ${order.id}::uuid
      `
    } else {
      await sql`
        UPDATE orders
        SET shipping_json = ${sql.json(merged as never)}
        WHERE id = ${order.id}::uuid
      `
    }

    const newEvents = getNewTrackingEvents(order.shipping_json, eventos)
    await notifyNewTrackingEvents(
      order.id,
      newEvents.length > 0 ? newEvents : eventos,
    )

    await sql`
      UPDATE webhook_logs SET processed = true WHERE id = ${log.id}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('webhook shipping/rastreamento error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    )
  }
}
