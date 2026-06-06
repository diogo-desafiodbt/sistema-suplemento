import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/lib/inngest/client'
import type { SupabaseClient } from '@supabase/supabase-js'

type PagarmePayload = {
  type?: string
  id?: string
  data?: {
    id?: string
    metadata?: Record<string, string>
    subscription?: {
      metadata?: Record<string, string>
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
  return payload.data?.id ?? payload.id
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
  dispatchPharmacy: boolean
): Promise<void> {
  const subscriptionId = metadata.subscription_id
  const userId = metadata.user_id
  const planType = metadata.plan_type ?? '1mes'

  if (!subscriptionId || !userId) {
    console.error('Webhook sem metadata:', metadata)
    return
  }

  const expiresAt = new Date()
  if (planType === '1mes') expiresAt.setMonth(expiresAt.getMonth() + 1)
  else if (planType === '3meses') expiresAt.setMonth(expiresAt.getMonth() + 3)
  else expiresAt.setFullYear(expiresAt.getFullYear() + 1)

  await admin
    .from('subscriptions')
    .update({
      status: 'active',
      expires_at: expiresAt.toISOString(),
      next_billing_at: expiresAt.toISOString(),
    })
    .eq('id', subscriptionId)

  if (chargeId) {
    await admin
      .from('payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('pagarme_charge_id', chargeId)
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

  if (webhookLogId) {
    await admin
      .from('webhook_logs')
      .update({ processed: true })
      .eq('id', webhookLogId)
  }

  if (dispatchPharmacy) {
    try {
      await inngest.send({
        name: 'pagamento/confirmado',
        data: { subscription_id: subscriptionId, user_id: userId },
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
  const token = request.nextUrl.searchParams.get('token')
  if (!token || token !== process.env.PAGARME_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    const payload = (await request.json()) as PagarmePayload

    const { data: webhookLog } = await admin.from('webhook_logs').insert({
      source: 'pagarme',
      event_type: payload.type ?? 'unknown',
      payload,
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
        dispatchPharmacy
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
    return NextResponse.json({ ok: true })
  }
}
