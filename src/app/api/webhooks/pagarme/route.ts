import { type NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'
import { asNumber, getSql } from '@/lib/db'
import { inngest } from '@/lib/inngest/client'
import { addPlanPeriod } from '@/lib/plans'
import { ensureProtocolAfterPayment } from '@/lib/protocol/create-from-checkout'
import { summarizePagarmePayload } from '@/lib/security/pagarme'
import { isBearerOrQueryTokenAuthorized } from '@/lib/security/token'

type PagarmePayload = {
  type?: string
  id?: string
  data?: {
    id?: string
    amount?: number
    paid_amount?: number
    metadata?: Record<string, string>
    subscription?: {
      metadata?: Record<string, string>
    }
    current_cycle?: {
      id?: string
      amount?: number
    }
    last_transaction?: {
      amount?: number
    }
    charges?: Array<{
      id?: string
      amount?: number
      paid_amount?: number
    }>
    invoice?: {
      amount?: number
      charge?: { id?: string }
    }
  }
  metadata?: Record<string, string>
}

function extractMetadata(payload: PagarmePayload): Record<string, string> {
  return (
    payload.data?.metadata ??
    payload.data?.subscription?.metadata ??
    payload.metadata ??
    {}
  )
}

function getChargeId(payload: PagarmePayload): string | undefined {
  return getChargeIdCandidates(payload)[0]
}

/** IDs possíveis da cobrança — checkout grava charge.id; subscription events
 *  costumam trazer data.id = subscription/invoice. Preferir charge real. */
function getChargeIdCandidates(payload: PagarmePayload): string[] {
  const raw = [
    payload.data?.charges?.[0]?.id,
    payload.data?.invoice?.charge?.id,
    payload.data?.id,
    payload.id,
    payload.data?.current_cycle?.id,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of raw) {
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/** Valor em reais (mesma unidade de `payments.amount` no checkout). Pagar.me manda centavos. */
export function extractAmountFromPayload(payload: PagarmePayload): number {
  const data = payload.data
  if (!data) return 0

  const candidates = [
    data.amount,
    data.paid_amount,
    data.last_transaction?.amount,
    data.current_cycle?.amount,
    data.invoice?.amount,
    data.charges?.[0]?.amount,
    data.charges?.[0]?.paid_amount,
  ]

  for (const raw of candidates) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return asNumber(raw) / 100
    }
  }
  console.error(
    'extractAmountFromPayload: nenhum valor encontrado no payload',
    summarizePagarmePayload(payload),
  )
  return 0
}

async function shouldDispatchPharmacy(
  subscriptionId: string,
  eventType: string | undefined,
): Promise<boolean> {
  const triggersPharmacy =
    eventType === 'charge.paid' ||
    eventType === 'order.paid' ||
    eventType === 'subscription.payment_succeeded'

  if (!triggersPharmacy) return false

  const sql = getSql()
  const subRows = await sql<
    {
      id: string
      protocol_id: string | null
      pending_checkout: {
        skip_pharmacy_webhook?: boolean
        shipping_payment_pending?: boolean
      } | null
    }[]
  >`
    SELECT id, protocol_id, pending_checkout
    FROM subscriptions
    WHERE id = ${subscriptionId}::uuid
    LIMIT 1
  `
  const sub = subRows[0] ?? null

  const pending = sub?.pending_checkout
  if (pending?.skip_pharmacy_webhook) {
    console.log(
      `Farmácia não disparada — subscription ${subscriptionId} marcada skip_pharmacy_webhook`,
    )
    return false
  }
  if (pending?.shipping_payment_pending) {
    console.log(
      `Farmácia não disparada — frete ainda pendente na subscription ${subscriptionId}`,
    )
    return false
  }

  const since = new Date()
  since.setHours(since.getHours() - 24)

  const subscriptionIds = new Set<string>([subscriptionId])
  if (sub?.protocol_id) {
    const siblings = await sql<{ id: string }[]>`
      SELECT id FROM subscriptions
      WHERE protocol_id = ${sub.protocol_id}::uuid
    `
    for (const s of siblings) {
      if (s.id) subscriptionIds.add(s.id)
    }
  }

  const ids = [...subscriptionIds]
  const recentOrder = await sql<{ id: string }[]>`
    SELECT id FROM orders
    WHERE subscription_id = ANY(${sql.array(ids)}::uuid[])
      AND (pharmacy_sent_at IS NOT NULL OR pharmacy_json IS NOT NULL)
      AND created_at >= ${since.toISOString()}::timestamptz
    LIMIT 1
  `

  if (recentOrder[0]) {
    console.log(
      `Farmácia não disparada — pedido recente já existe para protocol/subscription (${ids.join(', ')})`,
    )
    return false
  }

  return true
}

async function handlePaymentSucceeded(
  metadata: Record<string, string>,
  chargeId: string | undefined,
  webhookLogId: string | undefined,
  dispatchPharmacy: boolean,
  payload: PagarmePayload,
): Promise<void> {
  const sql = getSql()
  const subscriptionId = metadata.subscription_id
  const userId = metadata.user_id
  const planType = metadata.plan_type ?? '1mes'

  if (!subscriptionId || !userId) {
    console.error('Webhook sem metadata:', metadata)
    return
  }

  const chargeIds = getChargeIdCandidates(payload)
  const existingPaid = await sql<
    {
      id: string
      pagarme_charge_id: string | null
      paid_at: string | Date | null
      created_at: string | Date
    }[]
  >`
    SELECT id, pagarme_charge_id, paid_at, created_at
    FROM payments
    WHERE subscription_id = ${subscriptionId}::uuid AND status = 'paid'
    LIMIT 20
  `

  const duplicateWindowMs = 2 * 60 * 60 * 1000
  const now = Date.now()
  const hasOtherPaidCharge = existingPaid.some((p) => {
    const id = p.pagarme_charge_id
    if (typeof id !== 'string' || !id) return false
    if (chargeId && id === chargeId) return false
    if (chargeIds.includes(id)) return false
    const when = p.paid_at ?? p.created_at
    if (!when) return true
    return now - new Date(when).getTime() < duplicateWindowMs
  })

  const skipFulfillment = hasOtherPaidCharge
  if (skipFulfillment) {
    console.warn(
      'Webhook: subscription já tem payment paid recente com charge_id diferente — pulando protocol/farmácia',
      {
        subscriptionId,
        chargeId,
        chargeIds,
        existingPaid: existingPaid.map((p) => p.pagarme_charge_id),
      },
    )
  }

  const expiresAt = addPlanPeriod(new Date(), planType)

  await sql`
    UPDATE subscriptions
    SET
      status = 'active',
      expires_at = ${expiresAt.toISOString()},
      next_billing_at = ${expiresAt.toISOString()}
    WHERE id = ${subscriptionId}::uuid
  `

  let paymentId: string | undefined

  if (chargeId) {
    const paidAt = new Date().toISOString()

    for (const candidateId of chargeIds) {
      try {
        const updated = await sql<{ id: string }[]>`
          UPDATE payments
          SET status = 'paid', paid_at = ${paidAt}
          WHERE pagarme_charge_id = ${candidateId}
          RETURNING id
        `
        if (updated.length > 0) {
          paymentId = updated[0].id
          break
        }
      } catch (updateError) {
        console.error('Webhook payments.update error:', updateError, {
          candidateId,
        })
      }
    }

    if (!paymentId) {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const chargeIdSet = new Set(chargeIds)

      const pendingPayments = await sql<
        {
          id: string
          pagarme_charge_id: string | null
          amount: string | number | null
          webhook_payload: unknown
        }[]
      >`
        SELECT id, pagarme_charge_id, amount, webhook_payload
        FROM payments
        WHERE subscription_id = ${subscriptionId}::uuid
          AND status = 'pending'
          AND created_at >= ${since}::timestamptz
        ORDER BY created_at DESC
        LIMIT 10
      `

      const payloadMentionsCharge = (webhookPayload: unknown): boolean => {
        if (!webhookPayload || typeof webhookPayload !== 'object') return false
        const raw = JSON.stringify(webhookPayload)
        return chargeIds.some((id) => raw.includes(id))
      }

      const matchedPending =
        pendingPayments.find(
          (p) =>
            typeof p.pagarme_charge_id === 'string' &&
            chargeIdSet.has(p.pagarme_charge_id),
        ) ??
        pendingPayments.find((p) => payloadMentionsCharge(p.webhook_payload))

      if (matchedPending?.id) {
        try {
          const updatedPending = await sql<{ id: string }[]>`
            UPDATE payments
            SET
              status = 'paid',
              paid_at = ${paidAt},
              pagarme_charge_id = ${chargeId}
            WHERE id = ${matchedPending.id}::uuid AND status = 'pending'
            RETURNING id
          `
          if (updatedPending[0]?.id) {
            paymentId = updatedPending[0].id
          }
        } catch (pendingErr) {
          if (
            pendingErr instanceof postgres.PostgresError &&
            pendingErr.code === '23505'
          ) {
            const existingPayment = await sql<{ id: string }[]>`
              SELECT id FROM payments
              WHERE pagarme_charge_id = ${chargeId}
              LIMIT 1
            `
            paymentId = existingPayment[0]?.id
          } else {
            console.error('Webhook payments.pending update error:', pendingErr)
          }
        }
      } else if (pendingPayments.length > 0) {
        console.warn(
          'Webhook: pending payments existem mas nenhum correlaciona com chargeIds',
          {
            subscriptionId,
            chargeIds,
            pendingIds: pendingPayments.map((p) => p.id),
          },
        )
      }
    }

    if (!paymentId) {
      try {
        const inserted = await sql<{ id: string }[]>`
          INSERT INTO payments (
            subscription_id, pagarme_charge_id, amount, status, paid_at
          )
          VALUES (
            ${subscriptionId}::uuid,
            ${chargeId},
            ${extractAmountFromPayload(payload)},
            'paid',
            ${paidAt}
          )
          RETURNING id
        `
        paymentId = inserted[0]?.id
        if (!paymentId) {
          throw new Error('Webhook payments.insert não retornou id')
        }
      } catch (insertError) {
        if (
          insertError instanceof postgres.PostgresError &&
          insertError.code === '23505'
        ) {
          const existingPayment = await sql<{ id: string }[]>`
            SELECT id FROM payments
            WHERE pagarme_charge_id = ${chargeId}
            LIMIT 1
          `
          paymentId = existingPayment[0]?.id
        } else {
          console.error('Webhook payments.insert error:', insertError)
        }
      }
    }
  } else {
    console.warn(
      'handlePaymentSucceeded: payload sem chargeId, payments não atualizado',
      summarizePagarmePayload(payload),
    )
  }

  await sql`
    INSERT INTO user_entitlements (user_id, product_key, status, expires_at, is_permanent)
    VALUES (${userId}::uuid, 'treatment', 'active', ${expiresAt.toISOString()}::timestamptz, false)
    ON CONFLICT (user_id, product_key)
    DO UPDATE SET status = EXCLUDED.status, expires_at = EXCLUDED.expires_at
  `

  if (!skipFulfillment) {
    await ensureProtocolAfterPayment(subscriptionId, userId)
  }

  if (webhookLogId) {
    await sql`
      UPDATE webhook_logs SET processed = true WHERE id = ${webhookLogId}::uuid
    `
  }

  if (!skipFulfillment && dispatchPharmacy) {
    const subRows = await sql<{ protocol_id: string | null }[]>`
      SELECT protocol_id FROM subscriptions
      WHERE id = ${subscriptionId}::uuid
      LIMIT 1
    `
    const sub = subRows[0] ?? null

    if (!sub?.protocol_id) {
      throw new Error(
        `Farmácia não disparada — protocolo ainda ausente para subscription ${subscriptionId}`,
      )
    }

    try {
      await inngest.send({
        name: 'pagamento/confirmado',
        data: {
          subscription_id: subscriptionId,
          user_id: userId,
          ...(paymentId ? { payment_id: paymentId } : {}),
        },
      })
    } catch (inngestError) {
      console.error('Erro ao disparar pagamento/confirmado:', inngestError)
    }
  }
}

async function handleSubscriptionPaymentFailed(
  metadata: Record<string, string>,
  chargeId: string | undefined,
  webhookLogId: string | undefined,
): Promise<void> {
  const sql = getSql()
  const subscriptionId = metadata.subscription_id
  if (!subscriptionId) return

  if (chargeId) {
    await sql`
      UPDATE payments SET status = 'failed'
      WHERE pagarme_charge_id = ${chargeId}
    `
  }

  const subRows = await sql<{ user_id: string; plan_type: string }[]>`
    SELECT user_id, plan_type FROM subscriptions
    WHERE id = ${subscriptionId}::uuid
  `
  const sub = subRows[0]
  if (!sub) {
    throw new Error(
      `subscription.payment_failed: subscription ${subscriptionId} não encontrada`,
    )
  }

  if (sub.plan_type === '1mes') return

  const userId = metadata.user_id ?? sub.user_id

  if (!userId) {
    console.error('subscription.payment_failed sem user_id:', metadata)
    return
  }

  try {
    await inngest.send({
      name: 'pagamento/falhou',
      data: { subscription_id: subscriptionId, user_id: userId },
    })
  } catch (inngestError) {
    console.error('Erro ao disparar pagamento/falhou:', inngestError)
  }

  if (webhookLogId) {
    await sql`
      UPDATE webhook_logs SET processed = true WHERE id = ${webhookLogId}::uuid
    `
  }
}

export async function POST(request: NextRequest) {
  if (
    !isBearerOrQueryTokenAuthorized(request, process.env.PAGARME_WEBHOOK_TOKEN)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = (await request.json()) as PagarmePayload
    const sql = getSql()

    const logRows = await sql<{ id: string }[]>`
      INSERT INTO webhook_logs (source, event_type, payload, processed)
      VALUES (
        'pagarme',
        ${payload.type ?? 'unknown'},
        ${sql.json(summarizePagarmePayload(payload) as never)},
        false
      )
      RETURNING id
    `
    const webhookLog = logRows[0]
    if (!webhookLog) {
      throw new Error('pagarme webhook: insert webhook_logs sem id')
    }

    const eventType = payload.type
    const metadata = extractMetadata(payload)
    const chargeId = getChargeId(payload)

    if (
      eventType === 'charge.paid' ||
      eventType === 'order.paid' ||
      eventType === 'subscription.payment_succeeded'
    ) {
      const dispatchPharmacy = metadata.subscription_id
        ? await shouldDispatchPharmacy(metadata.subscription_id, eventType)
        : false

      await handlePaymentSucceeded(
        metadata,
        chargeId,
        webhookLog.id,
        dispatchPharmacy,
        payload,
      )
    }

    if (eventType === 'subscription.payment_failed') {
      await handleSubscriptionPaymentFailed(
        metadata,
        chargeId,
        webhookLog.id,
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    )
  }
}
