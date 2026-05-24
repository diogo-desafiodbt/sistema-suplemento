import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const admin = createAdminClient()

  try {
    const payload = await request.json()

    const { data: webhookLog } = await admin.from('webhook_logs').insert({
      source: 'pagarme',
      event_type: payload.type ?? 'unknown',
      payload,
      processed: false,
    }).select('id').single()

    const eventType = payload.type

    if (eventType === 'charge.paid' || eventType === 'order.paid') {
      const metadata = payload.data?.metadata ?? payload.metadata ?? {}
      const subscriptionId = metadata.subscription_id
      const userId = metadata.user_id
      const planType = metadata.plan_type ?? '1mes'
      const chargeId = payload.data?.id ?? payload.id

      if (!subscriptionId || !userId) {
        console.error('Webhook sem metadata:', metadata)
        return NextResponse.json({ ok: true })
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

      await admin
        .from('payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('pagarme_charge_id', chargeId)

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

      if (webhookLog?.id) {
        await admin
          .from('webhook_logs')
          .update({ processed: true })
          .eq('id', webhookLog.id)
      }
    }

    if (eventType === 'charge.payment_failed') {
      const metadata = payload.data?.metadata ?? {}
      const subscriptionId = metadata.subscription_id

      if (subscriptionId) {
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

        await admin
          .from('payments')
          .update({ status: 'failed' })
          .eq('pagarme_charge_id', payload.data?.id)

        if (webhookLog?.id) {
          await admin
            .from('webhook_logs')
            .update({ processed: true })
            .eq('id', webhookLog.id)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
