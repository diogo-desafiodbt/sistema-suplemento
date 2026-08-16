import { asNumber, getSql } from '@/lib/db'
import {
  addBusinessDays,
  estimateCustomerDeliveryDays,
} from '@/lib/shipping/estimate'

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

  const sql = getSql()

  if (category === 'frete') {
    const orderRows = await sql<
      {
        id: string
        status: string
        tracking_code: string | null
        created_at: string | Date
        shipping_json: unknown
        shipping_quote_json: unknown
      }[]
    >`
      SELECT id, status, tracking_code, created_at, shipping_json, shipping_quote_json
      FROM orders
      WHERE user_id = ${userId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `
    const order = orderRows[0] ?? null

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
  const subscriptionRows = await sql<
    {
      id: string
      plan_type: string | null
      status: string | null
      next_billing_at: string | Date | null
      expires_at: string | Date | null
    }[]
  >`
    SELECT id, plan_type, status, next_billing_at, expires_at
    FROM subscriptions
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `
  const subscription = subscriptionRows[0] ?? null

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

  const paymentRows = await sql<{ status: string | null; amount: string | number | null }[]>`
    SELECT status, amount FROM payments
    WHERE subscription_id = ${subscription.id}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `
  const payment = paymentRows[0] ?? null

  return {
    category,
    pagamento: {
      payment_status: payment?.status ?? null,
      amount: payment?.amount == null ? null : asNumber(payment.amount),
      plan_type: subscription.plan_type,
      next_billing_at: subscription.next_billing_at
        ? new Date(subscription.next_billing_at).toISOString()
        : null,
      expires_at: subscription.expires_at
        ? new Date(subscription.expires_at).toISOString()
        : null,
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
