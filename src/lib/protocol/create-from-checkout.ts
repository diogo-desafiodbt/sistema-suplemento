import { createAdminClient } from '@/lib/supabase/admin'
import { productKeyFromName } from '@/lib/protocol/triage'
import { claimOnce, releaseClaim } from '@/lib/idempotency'
import { getPharmacyCycleMultiplier } from '@/lib/plans'

export type CheckoutSource = 'full_quiz' | 'mini_quiz'

export type PendingProtocolItem = {
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
  shipping?: {
    tipo: 'economica' | 'expressa' | 'padrao'
    valor: number
    prazoDias: number
    codigoServico: string
  }
  quiz: {
    full_name: string
    birth_date: string
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
  }
  protocol_items: PendingProtocolItem[]
}

type AdminClient = ReturnType<typeof createAdminClient>

async function waitForProtocolId(
  admin: AdminClient,
  subscriptionId: string
): Promise<string | null> {
  // ~15s no request path (checkout/webhook); se esgotar, o webhook responde 500 e retenta.
  for (let i = 0; i < 30; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const { data } = await admin
      .from('subscriptions')
      .select('protocol_id')
      .eq('id', subscriptionId)
      .maybeSingle()
    // Só preenchido quando a criação terminou (items + link final).
    if (data?.protocol_id) {
      return data.protocol_id as string
    }
  }
  console.error(
    'ensureProtocolAfterPayment: timed out waiting for protocol_id',
    subscriptionId
  )
  return null
}

async function stampLockProtocolId(
  admin: AdminClient,
  subscriptionId: string,
  protocolId: string
): Promise<void> {
  const { error } = await admin
    .from('protocol_creation_locks')
    .update({ protocol_id: protocolId })
    .eq('subscription_id', subscriptionId)
  if (error) {
    console.error('ensureProtocolAfterPayment: falha ao gravar protocol_id no lock', error)
  }
}

async function insertProtocolItemsFromPending(
  admin: AdminClient,
  protocolId: string,
  pending: PendingCheckoutPayload
): Promise<boolean> {
  const activeItems = pending.protocol_items.filter(
    (item) => !item.removed && !item.blocked
  )
  if (activeItems.length === 0) return true

  const { count } = await admin
    .from('protocol_items')
    .select('id', { count: 'exact', head: true })
    .eq('protocol_id', protocolId)
  if ((count ?? 0) > 0) return true

  const withIds = activeItems.filter((item) => item.product_id)
  const withoutIds = activeItems.filter((item) => !item.product_id)

  // TODO(Miligrama): quantity física = qty × ciclo (3/6). Pode mudar após validação.
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
    const { data: products } = await admin
      .from('products')
      .select('id, name')
      .eq('is_active', true)

    for (const item of withoutIds) {
      const itemKey = productKeyFromName(item.product_name)
      const product = itemKey
        ? products?.find((p) => productKeyFromName(p.name) === itemKey)
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
        }
      )
      return false
    }
    return true
  }

  const { error: itemsError } = await admin
    .from('protocol_items')
    .insert(itemsToInsert)
  if (itemsError) {
    console.error('ensureProtocolAfterPayment: items insert error', itemsError)
    return false
  }
  return true
}

async function finalizeSubscriptionProtocol(
  admin: AdminClient,
  subscriptionId: string,
  protocolId: string,
  pending: PendingCheckoutPayload
): Promise<boolean> {
  // Mantém snapshot de frete + itens pagos pra farmácia (não confiar em edits pós-pagamento).
  const fulfillmentCheckout = {
    source: pending.source,
    plan_type: pending.plan_type,
    shipping: pending.shipping ?? null,
    protocol_items: pending.protocol_items.filter(
      (i) => !i.removed && !i.blocked && Boolean(i.product_id)
    ),
    fulfillment_locked_at: new Date().toISOString(),
  }

  const { error } = await admin
    .from('subscriptions')
    .update({
      protocol_id: protocolId,
      pending_checkout: fulfillmentCheckout,
    })
    .eq('id', subscriptionId)
  if (error) {
    console.error(
      'ensureProtocolAfterPayment: subscription link error',
      error
    )
    return false
  }
  return true
}

/**
 * Creates quiz_response + protocol + items from a pending checkout payload.
 * Idempotent: if subscription already has protocol_id, returns it.
 * Uses protocol_creation_locks to avoid checkout+webhook races.
 *
 * `subscriptions.protocol_id` só é gravado no final (protocolo + items prontos),
 * pra waitForProtocolId nunca devolver um id incompleto/inválido. O lock guarda
 * `protocol_id` como breadcrumb da própria subscription pra crash recovery.
 */
export async function ensureProtocolAfterPayment(
  admin: AdminClient,
  subscriptionId: string,
  userId: string
): Promise<string | null> {
  const { data: subscription, error: subError } = await admin
    .from('subscriptions')
    .select('id, protocol_id, pending_checkout')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single()

  if (subError || !subscription) {
    console.error('ensureProtocolAfterPayment: subscription not found', subError)
    return null
  }

  if (subscription.protocol_id) {
    const { data: existingProtocol } = await admin
      .from('protocols')
      .select('id')
      .eq('id', subscription.protocol_id)
      .maybeSingle()
    if (existingProtocol) {
      return subscription.protocol_id as string
    }
    // Link órfão (rollback antigo sem limpar protocol_id) — limpa e recria.
    console.warn(
      'ensureProtocolAfterPayment: protocol_id órfão na subscription, limpando',
      { subscriptionId, protocol_id: subscription.protocol_id }
    )
    await admin
      .from('subscriptions')
      .update({ protocol_id: null })
      .eq('id', subscriptionId)
      .eq('protocol_id', subscription.protocol_id)
  }

  const pending = subscription.pending_checkout as PendingCheckoutPayload | null
  if (!pending?.quiz?.diagnosis_type || !Array.isArray(pending.protocol_items)) {
    console.error('ensureProtocolAfterPayment: missing pending_checkout', subscriptionId)
    return null
  }

  const { won, reclaimedStale } = await claimOnce(admin, 'protocol_creation_locks', {
    subscription_id: subscriptionId,
  })
  if (!won) {
    return waitForProtocolId(admin, subscriptionId)
  }

  // Crash anterior nesta mesma subscription — retoma o protocolo do lock ou
  // o criado com creation_subscription_id (breadcrumb se o stamp no lock falhou).
  const staleProtocolId =
    (typeof reclaimedStale?.protocol_id === 'string' &&
      reclaimedStale.protocol_id) ||
    null

  let resumeProtocolId = staleProtocolId
  if (!resumeProtocolId) {
    const { data: bySubscription } = await admin
      .from('protocols')
      .select('id')
      .eq('creation_subscription_id', subscriptionId)
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    resumeProtocolId = bySubscription?.id ?? null
  }

  if (resumeProtocolId) {
    const { data: existingProtocol } = await admin
      .from('protocols')
      .select('id')
      .eq('id', resumeProtocolId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingProtocol) {
      await stampLockProtocolId(admin, subscriptionId, resumeProtocolId)
      const itemsOk = await insertProtocolItemsFromPending(
        admin,
        resumeProtocolId,
        pending
      )
      if (!itemsOk) {
        // Libera o lock pra o webhook poder retentar; protocolo fica com
        // creation_subscription_id pra retomar na próxima claim.
        await releaseClaim(
          admin,
          'protocol_creation_locks',
          'subscription_id',
          subscriptionId
        )
        return null
      }
      const linked = await finalizeSubscriptionProtocol(
        admin,
        subscriptionId,
        resumeProtocolId,
        pending
      )
      if (!linked) {
        await releaseClaim(
          admin,
          'protocol_creation_locks',
          'subscription_id',
          subscriptionId
        )
        return null
      }
      await releaseClaim(
        admin,
        'protocol_creation_locks',
        'subscription_id',
        subscriptionId
      )
      return resumeProtocolId
    }
  }

  let quizResponseId: string | null = null
  let protocolIdCreated: string | null = null

  const rollbackPartialAndRelease = async () => {
    // Libera o lock antes de apagar o protocolo (FK protocol_id no lock).
    await releaseClaim(
      admin,
      'protocol_creation_locks',
      'subscription_id',
      subscriptionId
    )
    if (protocolIdCreated) {
      // Se finalize já tinha linkado, limpa o id órfão e restaura pending
      // pra o retry (webhook/checkout) conseguir recriar o protocolo.
      await admin
        .from('subscriptions')
        .update({
          protocol_id: null,
          pending_checkout: pending,
        })
        .eq('id', subscriptionId)
      await admin
        .from('protocol_items')
        .delete()
        .eq('protocol_id', protocolIdCreated)
      await admin.from('protocols').delete().eq('id', protocolIdCreated)
    }
    if (quizResponseId) {
      await admin.from('quiz_responses').delete().eq('id', quizResponseId)
    }
  }

  try {
    const source: CheckoutSource =
      pending.source === 'mini_quiz' ? 'mini_quiz' : 'full_quiz'
    const quiz = pending.quiz

    // Sempre atualiza perfil com nome e data de nascimento da triagem
    const updates: Record<string, string | null> = {}
    if (quiz.full_name?.trim()) updates.full_name = quiz.full_name.trim()
    if (quiz.birth_date) updates.birth_date = quiz.birth_date
    if (Object.keys(updates).length > 0) {
      await admin.from('users').update(updates).eq('id', userId)
    }

    const { data: quizResponse, error: quizError } = await admin
      .from('quiz_responses')
      .insert({
        user_id: userId,
        diagnosis_type: quiz.diagnosis_type,
        birth_date: quiz.birth_date,
        sex: quiz.sex,
        is_pregnant_or_breastfeeding: quiz.is_pregnant_or_breastfeeding,
        renal_conditions: quiz.renal_conditions ?? [],
        hepatic_conditions: quiz.hepatic_conditions ?? [],
        medications: quiz.medications ?? [],
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (quizError || !quizResponse) {
      console.error('ensureProtocolAfterPayment: quiz insert error', quizError)
      await rollbackPartialAndRelease()
      return null
    }
    quizResponseId = quizResponse.id as string

    const { data: protocol, error: protocolError } = await admin
      .from('protocols')
      .insert({
        user_id: userId,
        quiz_response_id: quizResponse.id,
        status: 'pending_signature',
        source,
        generated_at: new Date().toISOString(),
        creation_subscription_id: subscriptionId,
      })
      .select('id')
      .single()

    if (protocolError || !protocol) {
      console.error('ensureProtocolAfterPayment: protocol insert error', protocolError)
      await rollbackPartialAndRelease()
      return null
    }
    protocolIdCreated = protocol.id as string

    // Breadcrumb no lock desta subscription — ainda NÃO expõe na subscription.
    await stampLockProtocolId(admin, subscriptionId, protocol.id)

    const itemsOk = await insertProtocolItemsFromPending(
      admin,
      protocol.id,
      pending
    )
    if (!itemsOk) {
      await rollbackPartialAndRelease()
      return null
    }

    // Só agora o perdedor da corrida pode ver o protocol_id (estado completo).
    const linked = await finalizeSubscriptionProtocol(
      admin,
      subscriptionId,
      protocol.id,
      pending
    )
    if (!linked) {
      await rollbackPartialAndRelease()
      return null
    }

    await releaseClaim(
      admin,
      'protocol_creation_locks',
      'subscription_id',
      subscriptionId
    )

    return protocol.id as string
  } catch (error) {
    console.error('ensureProtocolAfterPayment: unexpected error', error)
    await rollbackPartialAndRelease()
    return null
  }
}
