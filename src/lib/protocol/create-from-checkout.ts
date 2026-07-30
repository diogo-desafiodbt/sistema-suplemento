import { createAdminClient } from '@/lib/supabase/admin'

export type CheckoutSource = 'full_quiz' | 'mini_quiz'

export type PendingProtocolItem = {
  product_id?: string
  product_name: string
  is_required?: boolean
  removed?: boolean
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
    diagnosis_type: 'type2' | 'prediabetes' | 'undiagnosed'
    years_diagnosed?: string
    hba1c_range?: string | null
    fasting_glucose?: string | null
    medications?: string[]
    family_history?: string[]
    symptoms?: string[]
    conditions_mild?: string[]
    conditions_serious?: string[]
    weight_status?: string | null
    exercise_freq?: string | null
    diet_quality?: string | null
    allergies?: string | null
    prior_treatment?: string[]
    age?: number
    full_name?: string
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

  if (source === 'mini_quiz') {
    const updates: Record<string, string | null> = {}
    if (quiz.full_name?.trim()) updates.full_name = quiz.full_name.trim()
    if (typeof quiz.age === 'number' && quiz.age > 0 && quiz.age < 120) {
      const year = new Date().getFullYear() - Math.floor(quiz.age)
      updates.birth_date = `${year}-01-01`
    }
    if (Object.keys(updates).length > 0) {
      await admin.from('users').update(updates).eq('id', userId)
    }
  }

  const { data: quizResponse, error: quizError } = await admin
    .from('quiz_responses')
    .insert({
      user_id: userId,
      diagnosis_type: quiz.diagnosis_type,
      years_diagnosed:
        source === 'mini_quiz'
          ? '<1ano'
          : (quiz.years_diagnosed ?? '<1ano'),
      hba1c_range: quiz.hba1c_range ?? null,
      fasting_glucose: quiz.fasting_glucose ?? null,
      medications: quiz.medications ?? [],
      family_history: quiz.family_history ?? [],
      symptoms: quiz.symptoms ?? [],
      conditions_mild: quiz.conditions_mild ?? [],
      conditions_serious: quiz.conditions_serious ?? [],
      weight_status: quiz.weight_status ?? null,
      exercise_freq: quiz.exercise_freq ?? null,
      diet_quality: quiz.diet_quality ?? null,
      allergies:
        source === 'mini_quiz'
          ? (typeof quiz.age === 'number' ? `idade:${quiz.age}` : null)
          : (quiz.allergies ?? null),
      prior_treatment: quiz.prior_treatment ?? [],
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

  const activeItems = pending.protocol_items.filter(item => !item.removed)
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
        item.activation_reason ??
        (source === 'mini_quiz'
          ? 'Selecionado por você no carrinho'
          : 'Recomendado pelo protocolo'),
      quantity: item.quantity ?? 1,
    }))

    if (withoutIds.length > 0) {
      const { data: products } = await admin
        .from('products')
        .select('id, name')
        .eq('is_active', true)

      for (const item of withoutIds) {
        const product = products?.find(p =>
          p.name.toLowerCase() === item.product_name.toLowerCase()
        ) ?? products?.find(p =>
          p.name.toLowerCase().includes(item.product_name.toLowerCase().split(' ')[0])
        )
        if (!product) continue
        itemsToInsert.push({
          protocol_id: protocol.id,
          product_id: product.id,
          is_required: item.is_required ?? false,
          removed_by_patient: false,
          activation_reason: item.activation_reason ?? 'Recomendado pelo protocolo',
          quantity: item.quantity ?? 1,
        })
      }
    }

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await admin.from('protocol_items').insert(itemsToInsert)
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
