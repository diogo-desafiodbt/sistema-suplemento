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

async function handlePaymentFailed(
  admin: SupabaseClient,
  metadata: Record<string, string>,
  chargeId: string | undefined,
  webhookLogId: string | undefined
): Promise<void> {
  const subscriptionId = metadata.subscription_id

  if (!subscriptionId) return

  const { data: sub } = await admin
    .from('subscriptions')
    .select('retry_count')
    .eq('id', subscriptionId)
    .single()

  const retryCount = (sub?.retry_count ?? 0) + 1
  const gracePeriodEnd = new Date()
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 10)

  await admin
    .from('subscriptions')
    .update({
      status: retryCount >= 3 ? 'past_due' : 'active',
      retry_count: retryCount,
      grace_period_ends_at: gracePeriodEnd.toISOString(),
    })
    .eq('id', subscriptionId)

  if (chargeId) {
    await admin
      .from('payments')
      .update({ status: 'failed' })
      .eq('pagarme_charge_id', chargeId)
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
      await handlePaymentSucceeded(
        admin,
        metadata,
        chargeId,
        webhookLog?.id,
        eventType === 'charge.paid' || eventType === 'order.paid'
      )
    }

    if (
      eventType === 'charge.payment_failed' ||
      eventType === 'subscription.payment_failed'
    ) {
      await handlePaymentFailed(admin, metadata, chargeId, webhookLog?.id)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
