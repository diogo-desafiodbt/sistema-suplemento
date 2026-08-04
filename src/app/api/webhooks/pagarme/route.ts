import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/lib/inngest/client'
import { ensureProtocolAfterPayment } from '@/lib/protocol/create-from-checkout'
import { addPlanPeriod } from '@/lib/plans'
import { isBearerOrQueryTokenAuthorized } from '@/lib/security/token'
import { summarizePagarmePayload } from '@/lib/security/pagarme'
import type { SupabaseClient } from '@supabase/supabase-js'

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
      return raw / 100
    }
  }
  console.error(
    'extractAmountFromPayload: nenhum valor encontrado no payload',
    summarizePagarmePayload(payload)
  )
  return 0
}

async function shouldDispatchPharmacy(
  admin: SupabaseClient,
  subscriptionId: string,
  eventType: string | undefined
): Promise<boolean> {
  const triggersPharmacy =
    eventType === 'charge.paid' ||
    eventType === 'order.paid' ||
    eventType === 'subscription.payment_succeeded'

  if (!triggersPharmacy) return false

  const since = new Date()
  since.setHours(since.getHours() - 24)

  const { data: recentOrder } = await admin
    .from('orders')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .not('pharmacy_sent_at', 'is', null)
    .gte('pharmacy_sent_at', since.toISOString())
    .limit(1)
    .maybeSingle()

  if (recentOrder) {
    console.log(
      `Farmácia não disparada — pedido recente já existe para subscription ${subscriptionId}`
    )
    return false
  }

  return true
}

async function handlePaymentSucceeded(
  admin: SupabaseClient,
  metadata: Record<string, string>,
  chargeId: string | undefined,
  webhookLogId: string | undefined,
  dispatchPharmacy: boolean,
  payload: PagarmePayload
): Promise<void> {
  const subscriptionId = metadata.subscription_id
  const userId = metadata.user_id
  const planType = metadata.plan_type ?? '1mes'

  if (!subscriptionId || !userId) {
    console.error('Webhook sem metadata:', metadata)
    return
  }

  // Model A: a cada cobrança paga, avança expires_at e next_billing_at pelo período do plano.
  const expiresAt = addPlanPeriod(new Date(), planType)

  await admin
    .from('subscriptions')
    .update({
      status: 'active',
      expires_at: expiresAt.toISOString(),
      next_billing_at: expiresAt.toISOString(),
    })
    .eq('id', subscriptionId)

  let paymentId: string | undefined

  if (chargeId) {
    const paidAt = new Date().toISOString()
    const chargeIds = getChargeIdCandidates(payload)

    // Tenta marcar como pago por qualquer ID conhecido da cobrança.
    for (const candidateId of chargeIds) {
      const { data: updated, error: updateError } = await admin
        .from('payments')
        .update({
          status: 'paid',
          paid_at: paidAt,
        })
        .eq('pagarme_charge_id', candidateId)
        .select('id')

      if (updateError) {
        console.error(
          'Webhook payments.update error:',
          updateError,
          { candidateId }
        )
        continue
      }
      if (updated && updated.length > 0) {
        paymentId = updated[0].id
        // Não sobrescrever pagarme_charge_id com getChargeId() — em
        // subscription.payment_succeeded o 1º candidato antigo (data.id) pode
        // ser subscription/invoice, não o charge que o checkout gravou.
        // Próximas entregas já batem em todos os candidates.
        break
      }
    }

    if (!paymentId) {
      // Checkout pode ter gravado cycle.id ≠ charge.id do webhook.
      // Só reaproveita pending se houver correlação com esta cobrança.
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const chargeIdSet = new Set(chargeIds)

      const { data: pendingPayments } = await admin
        .from('payments')
        .select('id, pagarme_charge_id, amount, webhook_payload')
        .eq('subscription_id', subscriptionId)
        .eq('status', 'pending')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10)

      const payloadMentionsCharge = (webhookPayload: unknown): boolean => {
        if (!webhookPayload || typeof webhookPayload !== 'object') return false
        const raw = JSON.stringify(webhookPayload)
        return chargeIds.some((id) => raw.includes(id))
      }

      // Só por correlação de charge id / payload — nunca só por valor.
      const matchedPending =
        pendingPayments?.find(
          (p) =>
            typeof p.pagarme_charge_id === 'string' &&
            chargeIdSet.has(p.pagarme_charge_id)
        ) ??
        pendingPayments?.find((p) => payloadMentionsCharge(p.webhook_payload))

      if (matchedPending?.id) {
        const { data: updatedPending, error: pendingErr } = await admin
          .from('payments')
          .update({
            status: 'paid',
            paid_at: paidAt,
            // chargeId já prioriza charges[0]/invoice.charge (não data.id de subscription).
            pagarme_charge_id: chargeId,
          })
          .eq('id', matchedPending.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle()

        if (pendingErr) {
          if (pendingErr.code === '23505') {
            const { data: existingPayment } = await admin
              .from('payments')
              .select('id')
              .eq('pagarme_charge_id', chargeId)
              .maybeSingle()
            paymentId = existingPayment?.id
          } else {
            console.error('Webhook payments.pending update error:', pendingErr)
          }
        } else if (updatedPending?.id) {
          paymentId = updatedPending.id
        }
      } else if ((pendingPayments?.length ?? 0) > 0) {
        console.warn(
          'Webhook: pending payments existem mas nenhum correlaciona com chargeIds',
          { subscriptionId, chargeIds, pendingIds: pendingPayments?.map((p) => p.id) }
        )
      }
    }

    if (!paymentId) {
      // Cobrança nova (renovação) — charge_id ainda não existia na tabela.
      const { data: inserted, error: insertError } = await admin
        .from('payments')
        .insert({
          subscription_id: subscriptionId,
          pagarme_charge_id: chargeId,
          amount: extractAmountFromPayload(payload),
          status: 'paid',
          paid_at: paidAt,
        })
        .select('id')
        .single()

      if (insertError) {
        if (insertError.code === '23505') {
          const { data: existingPayment } = await admin
            .from('payments')
            .select('id')
            .eq('pagarme_charge_id', chargeId)
            .maybeSingle()
          paymentId = existingPayment?.id
        } else {
          console.error('Webhook payments.insert error:', insertError)
        }
      } else {
        paymentId = inserted?.id
      }
    }
  } else {
    console.warn(
      'handlePaymentSucceeded: payload sem chargeId, payments não atualizado',
      summarizePagarmePayload(payload)
    )
  }

  const { data: existing } = await admin
    .from('user_entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('product_key', 'treatment')
    .maybeSingle()

  if (existing) {
    await admin
      .from('user_entitlements')
      .update({
        status: 'active',
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await admin.from('user_entitlements').insert({
      user_id: userId,
      product_key: 'treatment',
      status: 'active',
      expires_at: expiresAt.toISOString(),
      is_permanent: false,
    })
  }

  await ensureProtocolAfterPayment(admin, subscriptionId, userId)

  if (webhookLogId) {
    await admin
      .from('webhook_logs')
      .update({ processed: true })
      .eq('id', webhookLogId)
  }

  if (dispatchPharmacy) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('protocol_id')
      .eq('id', subscriptionId)
      .maybeSingle()

    if (!sub?.protocol_id) {
      // Faz o webhook falhar pra o Pagar.me retentar — criação pode ainda estar
      // em andamento (outro worker) ou ter demorado mais que o wait local.
      throw new Error(
        `Farmácia não disparada — protocolo ainda ausente para subscription ${subscriptionId}`
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
  admin: SupabaseClient,
  metadata: Record<string, string>,
  chargeId: string | undefined,
  webhookLogId: string | undefined
): Promise<void> {
  const subscriptionId = metadata.subscription_id
  if (!subscriptionId) return

  if (chargeId) {
    await admin
      .from('payments')
      .update({ status: 'failed' })
      .eq('pagarme_charge_id', chargeId)
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('user_id, plan_type')
    .eq('id', subscriptionId)
    .single()

  if (sub?.plan_type === '1mes') return

  const userId = metadata.user_id ?? sub?.user_id

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
    await admin
      .from('webhook_logs')
      .update({ processed: true })
      .eq('id', webhookLogId)
  }
}

export async function POST(request: NextRequest) {
  if (
    !isBearerOrQueryTokenAuthorized(
      request,
      process.env.PAGARME_WEBHOOK_TOKEN
    )
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    const payload = (await request.json()) as PagarmePayload

    const { data: webhookLog } = await admin.from('webhook_logs').insert({
      source: 'pagarme',
      event_type: payload.type ?? 'unknown',
      payload: summarizePagarmePayload(payload),
      processed: false,
    }).select('id').single()

    const eventType = payload.type
    const metadata = extractMetadata(payload)
    const chargeId = getChargeId(payload)

    if (
      eventType === 'charge.paid' ||
      eventType === 'order.paid' ||
      eventType === 'subscription.payment_succeeded'
    ) {
      const dispatchPharmacy = metadata.subscription_id
        ? await shouldDispatchPharmacy(admin, metadata.subscription_id, eventType)
        : false

      await handlePaymentSucceeded(
        admin,
        metadata,
        chargeId,
        webhookLog?.id,
        dispatchPharmacy,
        payload
      )
    }

    if (eventType === 'subscription.payment_failed') {
      await handleSubscriptionPaymentFailed(
        admin,
        metadata,
        chargeId,
        webhookLog?.id
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    // 500 pra o Pagar.me retentar (ex.: protocolo ainda em criação).
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
