import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { inngest } from '@/lib/inngest/client'
import { isBearerTokenAuthorizedComTransicao } from '@/lib/security/token'
import { summarizePharmacyWebhookPayload } from '@/lib/security/webhook-payload'

export async function POST(request: NextRequest) {
  // Credencial própria da Miligrama. Antes disto, quando FARMACIA_WEBHOOK_TOKEN
  // estava vazio, o fallback era o FARMACIA_API_TOKEN — o mesmo segredo que nós
  // enviamos a eles nas nossas chamadas, validando as chamadas deles para nós.
  // Um token fazendo dois trabalhos opostos: girar um quebrava o outro.
  //
  // Só header Authorization. Token em query string vaza para log de acesso,
  // proxy e referrer, e não há motivo para carregar esse risco numa credencial
  // que está nascendo agora.
  if (
    !isBearerTokenAuthorizedComTransicao(
      request,
      process.env.FARMACIA_WEBHOOK_TOKEN,
      process.env.FARMACIA_WEBHOOK_TOKEN_ANTERIOR ??
        process.env.FARMACIA_API_TOKEN,
    )
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const sql = getSql()

    const logRows = await sql<{ id: string }[]>`
      INSERT INTO webhook_logs (source, event_type, payload, processed)
      VALUES (
        'pharmacy',
        'order.dispatched',
        ${sql.json(summarizePharmacyWebhookPayload(payload) as never)},
        false
      )
      RETURNING id
    `
    const webhookLog = logRows[0]
    if (!webhookLog) {
      throw new Error('farmacia webhook: insert webhook_logs sem id')
    }

    const { NumeroObjeto, CodigoPedido } = payload

    if (!NumeroObjeto || !CodigoPedido) {
      return NextResponse.json({ ok: true })
    }

    const atualizados = await sql<{ id: string }[]>`
      UPDATE orders
      SET tracking_code = ${NumeroObjeto}, status = 'dispatched'
      WHERE id = ${CodigoPedido}::uuid
        AND (tracking_code IS DISTINCT FROM ${NumeroObjeto})
      RETURNING id
    `

    // O aviso de envio ao cliente saía do webhook da Envie Agora, que era
    // quem sabia do número do objeto quando a etiqueta era nossa. Desde
    // 02/09/2026 quem emite é a Miligrama, e esse webhook nunca mais dispara
    // — sem isto, o cliente deixaria de ser avisado de que o pedido saiu, e
    // nada acusaria a falta.
    //
    // O `RETURNING` acima é o que garante um aviso só: a farmácia reenvia o
    // mesmo webhook, e sem essa condição cada reenvio viraria um e-mail.
    if (atualizados.length > 0) {
      try {
        await inngest.send({
          name: 'envio/etiqueta-gerada',
          data: { order_id: CodigoPedido, tracking_code: NumeroObjeto },
        })
      } catch (erro) {
        // Falhar aqui não desfaz o rastreio, que já está gravado.
        console.error(
          `farmacia webhook: pedido ${CodigoPedido} despachado, aviso não enviado:`,
          erro,
        )
      }
    }

    await sql`
      UPDATE webhook_logs SET processed = true WHERE id = ${webhookLog.id}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Farmacia webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
