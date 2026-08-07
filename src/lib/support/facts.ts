import {
  addBusinessDays,
  estimateCustomerDeliveryDays,
} from '@/lib/shipping/estimate'
import { createAdminClient } from '@/lib/supabase/admin'

export type SupportCategory = 'frete' | 'pagamento' | 'fora_de_escopo'

export type SupportDbFacts = {
  category: SupportCategory
  frete?: {
    order_id: string
    status: string
    tracking_code: string | null
    last_event: {
      descricao: string | null
      cidade: string | null
      local: string | null
      datahora: string | null
    } | null
    estimated_delivery: string | null
    found: boolean
  }
  pagamento?: {
    payment_status: string | null
    amount: number | null
    plan_type: string | null
    next_billing_at: string | null
    expires_at: string | null
    subscription_status: string | null
    found: boolean
  }
}

type TrackingEvent = {
  datahora?: string
  descricao?: string | null
  local?: string | null
  cidade?: string | null
  finalizado?: number
}

export async function fetchSupportFacts(
  userId: string,
  category: SupportCategory,
): Promise<SupportDbFacts> {
  if (category === 'fora_de_escopo') {
    return { category }
  }

  const admin = createAdminClient()

  if (category === 'frete') {
    const { data: order } = await admin
      .from('orders')
      .select(
        'id, status, tracking_code, created_at, shipping_json, shipping_quote_json',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!order) {
      return {
        category,
        frete: {
          order_id: '',
          status: '',
          tracking_code: null,
          last_event: null,
          estimated_delivery: null,
          found: false,
        },
      }
    }

    const shippingJson = order.shipping_json as {
      eventos?: TrackingEvent[]
    } | null
    const eventos = [...(shippingJson?.eventos ?? [])].sort((a, b) => {
      const ta = a.datahora ? new Date(a.datahora).getTime() : 0
      const tb = b.datahora ? new Date(b.datahora).getTime() : 0
      return ta - tb
    })
    const last = eventos[eventos.length - 1] ?? null

    const quote = order.shipping_quote_json as { prazoDias?: number } | null
    const prazoDias = quote?.prazoDias
    const estimated =
      order.status !== 'delivered' &&
      typeof prazoDias === 'number' &&
      prazoDias > 0
        ? addBusinessDays(
            new Date(order.created_at),
            estimateCustomerDeliveryDays(prazoDias),
          ).toISOString()
        : null

    return {
      category,
      frete: {
        order_id: order.id,
        status: order.status,
        tracking_code: order.tracking_code,
        last_event: last
          ? {
              descricao: last.descricao ?? null,
              cidade: last.cidade ?? null,
              local: last.local ?? null,
              datahora: last.datahora ?? null,
            }
          : null,
        estimated_delivery: estimated,
        found: true,
      },
    }
  }

  // pagamento
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('id, plan_type, status, next_billing_at, expires_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!subscription) {
    return {
      category,
      pagamento: {
        payment_status: null,
        amount: null,
        plan_type: null,
        next_billing_at: null,
        expires_at: null,
        subscription_status: null,
        found: false,
      },
    }
  }

  const { data: payment } = await admin
    .from('payments')
    .select('status, amount')
    .eq('subscription_id', subscription.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    category,
    pagamento: {
      payment_status: payment?.status ?? null,
      amount: payment?.amount ?? null,
      plan_type: subscription.plan_type,
      next_billing_at: subscription.next_billing_at,
      expires_at: subscription.expires_at,
      subscription_status: subscription.status,
      found: true,
    },
  }
}

export function hasRelevantFacts(facts: SupportDbFacts): boolean {
  if (facts.category === 'frete') return Boolean(facts.frete?.found)
  if (facts.category === 'pagamento') return Boolean(facts.pagamento?.found)
  return false
}
