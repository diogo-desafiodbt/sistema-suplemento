import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
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

    await sql`
      UPDATE orders
      SET tracking_code = ${NumeroObjeto}, status = 'dispatched'
      WHERE id = ${CodigoPedido}::uuid
    `

    await sql`
      UPDATE webhook_logs SET processed = true WHERE id = ${webhookLog.id}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Farmacia webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
