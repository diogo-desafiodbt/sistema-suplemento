import { type NextRequest, NextResponse } from 'next/server'
import { isBearerTokenAuthorizedComTransicao } from '@/lib/security/token'
import { summarizePharmacyWebhookPayload } from '@/lib/security/webhook-payload'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const admin = createAdminClient()

    const { data: webhookLog } = await admin
      .from('webhook_logs')
      .insert({
        source: 'pharmacy',
        event_type: 'order.dispatched',
        payload: summarizePharmacyWebhookPayload(payload),
        processed: false,
      })
      .select('id')
      .single()

    const { NumeroObjeto, CodigoPedido } = payload

    if (!NumeroObjeto || !CodigoPedido) {
      return NextResponse.json({ ok: true })
    }

    await admin
      .from('orders')
      .update({
        tracking_code: NumeroObjeto,
        status: 'dispatched',
      })
      .eq('id', CodigoPedido)

    if (webhookLog?.id) {
      await admin
        .from('webhook_logs')
        .update({ processed: true })
        .eq('id', webhookLog.id)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Farmacia webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
