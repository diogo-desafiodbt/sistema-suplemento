import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { inngest } from '@/lib/inngest/client'
import { isTokenDeParceiroSemCabecalho } from '@/lib/security/token'
import { summarizeShippingWebhookPayload } from '@/lib/security/webhook-payload'
import { getNewTrackingEvents } from '@/lib/shipping/notify'
import { mergeTrackingEvents } from '@/lib/shipping/tracking-events'
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

    // Quais eventos são novos tem que ser decidido AQUI, contra o
    // `shipping_json` de antes do merge. Depois do UPDATE abaixo todos passam a
    // constar como conhecidos, e o Inngest não teria mais como distinguir —
    // mandaria um e-mail por evento do histórico do pedido na primeira vez.
    // A função é pura sobre JSON, não toca tabela, então roda bem em app_entrada.
    const newEvents = getNewTrackingEvents(order.shipping_json, eventos)

    // Persiste antes de enfileirar o aviso. notifyShippingUpdate (no Inngest)
    // é idempotente por (order_id, event_id); no retry o claim evita reenvio.
    const merged = mergeTrackingEvents(
      order.shipping_json,
      eventos as unknown as Array<Record<string, unknown>>,
    )

    // `finalizado` chega como número na API que consultamos e como booleano no
    // webhook que eles empurram. Comparar com `=== 1` funcionava num e falhava
    // no outro sem dar erro: o pedido nunca sairia de "a caminho".
    //
    // A descrição fica como segunda via. Se um dia eles mudarem o campo de
    // novo, a entrega continua sendo reconhecida pelo texto que o próprio
    // cliente lê no rastreio.
    const concluido = (v: number | boolean | undefined): boolean =>
      v === true || v === 1
    const entregue = eventos.some(
      (e) => concluido(e.finalizado) || /\bentregue\b/i.test(e.descricao ?? ''),
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

    // O rastreio já está salvo. O e-mail sai no Inngest (app_web) — aqui só
    // enfileiramos. Falhar o send NÃO pode virar 500: a transportadora
    // reenviaria o evento para sempre. O Inngest reexecuta o aviso sozinho.
    try {
      await inngest.send({
        name: 'envio/rastreio-atualizado',
        data: {
          order_id: order.id,
          eventos: newEvents.length > 0 ? newEvents : eventos,
        },
      })
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro)
      console.error('Falha ao enfileirar aviso de rastreio:', msg)
      await sql`
        UPDATE webhook_logs SET error_message = ${`aviso ao cliente falhou: ${msg}`}
        WHERE id = ${log.id}::uuid
      `
    }

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
