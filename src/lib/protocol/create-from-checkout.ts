import { asNumber, getSql, withTransaction } from '@/lib/db'
import { claimOnce, releaseClaim } from '@/lib/idempotency'
import { getPharmacyCycleMultiplier } from '@/lib/plans'
import { productKeyFromName } from '@/lib/protocol/triage'
import type { ShippingSelection } from '@/types/shipping'
import type postgres from 'postgres'

type CheckoutSource = 'full_quiz' | 'mini_quiz'

type PendingProtocolItem = {
  product_id?: string
  product_name: string
  is_required?: boolean
  removed?: boolean
  blocked?: boolean
  activation_reason?: string
  quantity?: number
}

export type PendingCheckoutPayload = {
  source: CheckoutSource
  plan_type: '1mes' | 'assinatura_mensal' | '3meses' | '6meses' | '1ano'
  shipping?: ShippingSelection
  quiz: {
    full_name: string
    age: number
    birth_date?: string
    sex: 'homem' | 'mulher'
    is_pregnant_or_breastfeeding: boolean
    renal_conditions: string[]
    hepatic_conditions: string[]
    diagnosis_type:
      | 'type1'
      | 'type2'
      | 'prediabetes'
      | 'lada_avancado'
      | 'undiagnosed'
    medications: string[]
    allergies?: string | null
  }
  protocol_items: PendingProtocolItem[]
}

type DbSql = postgres.Sql | postgres.TransactionSql

async function waitForProtocolId(subscriptionId: string): Promise<string | null> {
  const sql = getSql()
  for (let i = 0; i < 30; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const rows = await sql<{ protocol_id: string | null }[]>`
      SELECT protocol_id FROM subscriptions
      WHERE id = ${subscriptionId}::uuid
      LIMIT 1
    `
    if (rows[0]?.protocol_id) {
      return rows[0].protocol_id
    }
  }
  console.error(
    'ensureProtocolAfterPayment: timed out waiting for protocol_id',
    subscriptionId,
  )
  return null
}

async function stampLockProtocolId(
  sql: DbSql,
  subscriptionId: string,
  protocolId: string,
): Promise<void> {
  try {
    await sql`
      UPDATE protocol_creation_locks
      SET protocol_id = ${protocolId}::uuid
      WHERE subscription_id = ${subscriptionId}::uuid
    `
  } catch (error) {
    console.error(
      'ensureProtocolAfterPayment: falha ao gravar protocol_id no lock',
      error,
    )
  }
}

async function insertProtocolItemsFromPending(
  sql: DbSql,
  protocolId: string,
  pending: PendingCheckoutPayload,
): Promise<boolean> {
  const activeItems = pending.protocol_items.filter(
    (item) => !item.removed && !item.blocked,
  )
  if (activeItems.length === 0) return true

  const countRows = await sql<{ n: string | number }[]>`
    SELECT COUNT(*) AS n FROM protocol_items
    WHERE protocol_id = ${protocolId}::uuid
  `
  if (asNumber(countRows[0]?.n) > 0) return true

  const withIds = activeItems.filter((item) => item.product_id)
  const withoutIds = activeItems.filter((item) => !item.product_id)
  const cycleMult = getPharmacyCycleMultiplier(pending.plan_type)

  const itemsToInsert: Array<{
    protocol_id: string
    product_id: string
    is_required: boolean
    removed_by_patient: boolean
    activation_reason: string
    quantity: number
  }> = withIds.map((item) => ({
    protocol_id: protocolId,
    product_id: item.product_id as string,
    is_required: item.is_required ?? false,
    removed_by_patient: false,
    activation_reason:
      item.activation_reason ?? 'Selecionado após triagem clínica',
    quantity: (item.quantity ?? 1) * cycleMult,
  }))

  if (withoutIds.length > 0) {
    const products = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM products WHERE is_active = true
    `

    for (const item of withoutIds) {
      const itemKey = productKeyFromName(item.product_name)
      const product = itemKey
        ? products.find((p) => productKeyFromName(p.name) === itemKey)
        : undefined
      if (!product) continue
      itemsToInsert.push({
        protocol_id: protocolId,
        product_id: product.id,
        is_required: item.is_required ?? false,
        removed_by_patient: false,
        activation_reason:
          item.activation_reason ?? 'Selecionado após triagem clínica',
        quantity: (item.quantity ?? 1) * cycleMult,
      })
    }
  }

  if (itemsToInsert.length === 0) {
    if (activeItems.length > 0) {
      console.error(
        'ensureProtocolAfterPayment: nenhum produto resolvido para items ativos',
        {
          protocolId,
          pendingNames: activeItems.map((item) => item.product_name),
        },
      )
      return false
    }
    return true
  }

  await sql`INSERT INTO protocol_items ${sql(itemsToInsert)}`
  return true
}

async function finalizeSubscriptionProtocol(
  sql: DbSql,
  subscriptionId: string,
  protocolId: string,
  pending: PendingCheckoutPayload,
): Promise<void> {
  const fulfillmentCheckout = {
    source: pending.source,
    plan_type: pending.plan_type,
    shipping: pending.shipping ?? null,
    protocol_items: pending.protocol_items.filter(
      (i) => !i.removed && !i.blocked && Boolean(i.product_id),
    ),
    fulfillment_locked_at: new Date().toISOString(),
  }

  await sql`
    UPDATE subscriptions
    SET
      protocol_id = ${protocolId}::uuid,
      pending_checkout = ${sql.json(fulfillmentCheckout as never)}
    WHERE id = ${subscriptionId}::uuid
  `
}

export async function ensureProtocolAfterPayment(
  subscriptionId: string,
  userId: string,
): Promise<string | null> {
  const sql = getSql()
  const subRows = await sql<
    {
      id: string
      protocol_id: string | null
      pending_checkout: PendingCheckoutPayload | null
    }[]
  >`
    SELECT id, protocol_id, pending_checkout
    FROM subscriptions
    WHERE id = ${subscriptionId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `
  const subscription = subRows[0]
  if (!subscription) {
    console.error('ensureProtocolAfterPayment: subscription not found')
    return null
  }

  if (subscription.protocol_id) {
    const existingProtocol = await sql<{ id: string }[]>`
      SELECT id FROM protocols WHERE id = ${subscription.protocol_id}::uuid LIMIT 1
    `
    if (existingProtocol[0]) {
      return subscription.protocol_id
    }
    console.warn(
      'ensureProtocolAfterPayment: protocol_id órfão na subscription, limpando',
      { subscriptionId, protocol_id: subscription.protocol_id },
    )
    await sql`
      UPDATE subscriptions
      SET protocol_id = NULL
      WHERE id = ${subscriptionId}::uuid
        AND protocol_id = ${subscription.protocol_id}::uuid
    `
  }

  const pending = subscription.pending_checkout
  if (
    !pending?.quiz?.diagnosis_type ||
    !Array.isArray(pending.protocol_items)
  ) {
    console.error(
      'ensureProtocolAfterPayment: missing pending_checkout',
      subscriptionId,
    )
    return null
  }

  const { won, reclaimedStale } = await claimOnce(
    'protocol_creation_locks',
    {
      subscription_id: subscriptionId,
    },
  )
  if (!won) {
    return waitForProtocolId(subscriptionId)
  }

  const staleProtocolId =
    (typeof reclaimedStale?.protocol_id === 'string' &&
      reclaimedStale.protocol_id) ||
    null

  let resumeProtocolId = staleProtocolId
  if (!resumeProtocolId) {
    const bySubscription = await sql<{ id: string }[]>`
      SELECT id FROM protocols
      WHERE creation_subscription_id = ${subscriptionId}::uuid
        AND user_id = ${userId}::uuid
      ORDER BY generated_at DESC
      LIMIT 1
    `
    resumeProtocolId = bySubscription[0]?.id ?? null
  }

  if (resumeProtocolId) {
    const existingProtocol = await sql<{ id: string }[]>`
      SELECT id FROM protocols
      WHERE id = ${resumeProtocolId}::uuid AND user_id = ${userId}::uuid
      LIMIT 1
    `

    if (existingProtocol[0]) {
      try {
        await withTransaction(async (tx) => {
          await stampLockProtocolId(tx, subscriptionId, resumeProtocolId)
          const itemsOk = await insertProtocolItemsFromPending(
            tx,
            resumeProtocolId,
            pending,
          )
          if (!itemsOk) {
            throw new Error('ensureProtocolAfterPayment: items resume falhou')
          }
          await finalizeSubscriptionProtocol(
            tx,
            subscriptionId,
            resumeProtocolId,
            pending,
          )
        })
        await releaseClaim(
          'protocol_creation_locks',
          'subscription_id',
          subscriptionId,
        )
        return resumeProtocolId
      } catch (error) {
        console.error('ensureProtocolAfterPayment: resume error', error)
        await releaseClaim(
          'protocol_creation_locks',
          'subscription_id',
          subscriptionId,
        )
        return null
      }
    }
  }

  try {
    const source: CheckoutSource =
      pending.source === 'mini_quiz' ? 'mini_quiz' : 'full_quiz'
    const quiz = pending.quiz

    const protocolId = await withTransaction(async (tx) => {
      const updates: Record<string, string | null> = {}
      if (quiz.full_name?.trim()) updates.full_name = quiz.full_name.trim()
      if (quiz.birth_date) updates.birth_date = quiz.birth_date
      if (Object.keys(updates).length > 0) {
        await tx`
          UPDATE users SET ${tx(updates)} WHERE id = ${userId}::uuid
        `
      }

      const quizRows = await tx<{ id: string }[]>`
        INSERT INTO quiz_responses ${tx({
          user_id: userId,
          diagnosis_type: quiz.diagnosis_type,
          age: quiz.age,
          ...(quiz.birth_date ? { birth_date: quiz.birth_date } : {}),
          sex: quiz.sex,
          is_pregnant_or_breastfeeding: quiz.is_pregnant_or_breastfeeding,
          renal_conditions: quiz.renal_conditions ?? [],
          hepatic_conditions: quiz.hepatic_conditions ?? [],
          medications: quiz.medications ?? [],
          allergies:
            typeof quiz.allergies === 'string' && quiz.allergies.trim()
              ? quiz.allergies.trim()
              : null,
          completed_at: new Date().toISOString(),
        })}
        RETURNING id
      `
      const quizResponse = quizRows[0]
      if (!quizResponse) {
        throw new Error('ensureProtocolAfterPayment: quiz insert sem id')
      }

      const protocolRows = await tx<{ id: string }[]>`
        INSERT INTO protocols ${tx({
          user_id: userId,
          quiz_response_id: quizResponse.id,
          status: 'pending_signature',
          source,
          generated_at: new Date().toISOString(),
          creation_subscription_id: subscriptionId,
        })}
        RETURNING id
      `
      const protocol = protocolRows[0]
      if (!protocol) {
        throw new Error('ensureProtocolAfterPayment: protocol insert sem id')
      }

      await stampLockProtocolId(tx, subscriptionId, protocol.id)

      const itemsOk = await insertProtocolItemsFromPending(
        tx,
        protocol.id,
        pending,
      )
      if (!itemsOk) {
        throw new Error('ensureProtocolAfterPayment: items insert falhou')
      }

      await finalizeSubscriptionProtocol(
        tx,
        subscriptionId,
        protocol.id,
        pending,
      )
      return protocol.id
    })

    await releaseClaim(
      'protocol_creation_locks',
      'subscription_id',
      subscriptionId,
    )
    return protocolId
  } catch (error) {
    console.error('ensureProtocolAfterPayment: unexpected error', error)
    await releaseClaim(
      'protocol_creation_locks',
      'subscription_id',
      subscriptionId,
    )
    return null
  }
}
