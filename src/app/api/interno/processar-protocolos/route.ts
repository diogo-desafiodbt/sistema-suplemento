import { type NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { ensureProtocolAfterPayment } from '@/lib/protocol/create-from-checkout'
import { isBearerTokenAuthorized } from '@/lib/security/token'

export async function POST(request: NextRequest) {
  if (!isBearerTokenAuthorized(request, process.env.INTERNO_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = getSql()
  const pendentes = await sql<{ id: string; user_id: string }[]>`
    SELECT s.id, s.user_id
    FROM subscriptions s
    JOIN payments p ON p.subscription_id = s.id AND p.status = 'paid'
    WHERE s.protocol_id IS NULL
    ORDER BY p.paid_at
    LIMIT 20
  `

  let processadas = 0
  let falhas = 0

  for (const pendente of pendentes) {
    try {
      await ensureProtocolAfterPayment(pendente.id, pendente.user_id)
      processadas++
    } catch (error) {
      falhas++
      console.error(
        'processar-protocolos: falha na subscription',
        pendente.id,
        error,
      )
    }
  }

  return NextResponse.json({ processadas, falhas })
}
