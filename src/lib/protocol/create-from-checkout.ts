import { createAdminClient } from '@/lib/supabase/admin'

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
  plan_type: '1mes' | 'assinatura_mensal' | '3meses' | '1ano'
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

/**
 * Creates quiz_response + protocol + items from a pending checkout payload.
 * Idempotent: if subscription already has protocol_id, returns it.
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
    return subscription.protocol_id as string
  }

  const pending = subscription.pending_checkout as PendingCheckoutPayload | null
  if (!pending?.quiz?.diagnosis_type || !Array.isArray(pending.protocol_items)) {
    console.error('ensureProtocolAfterPayment: missing pending_checkout', subscriptionId)
    return null
  }

  const source: CheckoutSource = pending.source === 'mini_quiz' ? 'mini_quiz' : 'full_quiz'
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
    return null
  }

  const { data: protocol, error: protocolError } = await admin
    .from('protocols')
    .insert({
      user_id: userId,
      quiz_response_id: quizResponse.id,
      status: 'pending_signature',
      source,
      generated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (protocolError || !protocol) {
    console.error('ensureProtocolAfterPayment: protocol insert error', protocolError)
    return null
  }

  const activeItems = pending.protocol_items.filter(
    item => !item.removed && !item.blocked
  )
  if (activeItems.length > 0) {
    const withIds = activeItems.filter(item => item.product_id)
    const withoutIds = activeItems.filter(item => !item.product_id)

    const itemsToInsert: Array<{
      protocol_id: string
      product_id: string
      is_required: boolean
      removed_by_patient: boolean
      activation_reason: string
      quantity: number
    }> = withIds.map(item => ({
      protocol_id: protocol.id,
      product_id: item.product_id as string,
      is_required: item.is_required ?? false,
      removed_by_patient: false,
      activation_reason:
        item.activation_reason ?? 'Selecionado após triagem clínica',
      quantity: item.quantity ?? 1,
    }))

    if (withoutIds.length > 0) {
      const { data: products } = await admin
        .from('products')
        .select('id, name')
        .eq('is_active', true)

      for (const item of withoutIds) {
        const product =
          products?.find(
            p => p.name.toLowerCase() === item.product_name.toLowerCase()
          ) ??
          products?.find(p =>
            p.name
              .toLowerCase()
              .includes(item.product_name.toLowerCase().split(' ')[0])
          )
        if (!product) continue
        itemsToInsert.push({
          protocol_id: protocol.id,
          product_id: product.id,
          is_required: item.is_required ?? false,
          removed_by_patient: false,
          activation_reason:
            item.activation_reason ?? 'Selecionado após triagem clínica',
          quantity: item.quantity ?? 1,
        })
      }
    }

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await admin
        .from('protocol_items')
        .insert(itemsToInsert)
      if (itemsError) {
        console.error('ensureProtocolAfterPayment: items insert error', itemsError)
      }
    }
  }

  await admin
    .from('subscriptions')
    .update({
      protocol_id: protocol.id,
      pending_checkout: null,
    })
    .eq('id', subscriptionId)

  return protocol.id as string
}
