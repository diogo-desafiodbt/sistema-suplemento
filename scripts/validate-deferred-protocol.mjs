/**
 * Validates deferred protocol creation for mini_quiz and full_quiz sources
 * against the production Supabase project (read/write test rows, then cleanup).
 *
 * Usage: node --input-type=module scripts/validate-deferred-protocol.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    })
)

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function ensureProtocolAfterPayment(subscriptionId, userId) {
  // Inline the critical logic by calling DB the same way as the app helper
  const { data: subscription, error: subError } = await admin
    .from('subscriptions')
    .select('id, protocol_id, pending_checkout')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single()

  if (subError || !subscription) throw new Error(`sub not found: ${subError?.message}`)
  if (subscription.protocol_id) return { protocolId: subscription.protocol_id, created: false }

  const pending = subscription.pending_checkout
  assert(pending?.quiz?.diagnosis_type, 'missing pending quiz')
  assert(Array.isArray(pending.protocol_items) && pending.protocol_items.length > 0, 'missing items')

  const source = pending.source === 'mini_quiz' ? 'mini_quiz' : 'full_quiz'
  const quiz = pending.quiz

  const { data: quizResponse, error: quizError } = await admin
    .from('quiz_responses')
    .insert({
      user_id: userId,
      diagnosis_type: quiz.diagnosis_type,
      years_diagnosed: source === 'mini_quiz' ? '<1ano' : (quiz.years_diagnosed ?? '<1ano'),
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
      allergies: source === 'mini_quiz' ? `idade:${quiz.age ?? 40}` : (quiz.allergies ?? null),
      prior_treatment: quiz.prior_treatment ?? [],
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (quizError) throw new Error(`quiz insert: ${quizError.message}`)

  const { data: protocol, error: protocolError } = await admin
    .from('protocols')
    .insert({
      user_id: userId,
      quiz_response_id: quizResponse.id,
      status: 'pending_signature',
      source,
      generated_at: new Date().toISOString(),
    })
    .select('id, source')
    .single()

  if (protocolError) throw new Error(`protocol insert: ${protocolError.message}`)

  const productId = pending.protocol_items[0].product_id
  if (productId) {
    await admin.from('protocol_items').insert({
      protocol_id: protocol.id,
      product_id: productId,
      is_required: false,
      removed_by_patient: false,
      activation_reason: 'test',
      quantity: 1,
    })
  }

  await admin
    .from('subscriptions')
    .update({ protocol_id: protocol.id, pending_checkout: null })
    .eq('id', subscriptionId)

  return { protocolId: protocol.id, source: protocol.source, created: true, quizResponseId: quizResponse.id }
}

async function runCase(label, source, quiz) {
  console.log(`\n=== ${label} ===`)

  const email = `validate-${source}-${Date.now()}@example.com`
  const password = 'Validate123!'

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: quiz.full_name ?? 'Validação Teste' },
  })
  if (createErr) throw new Error(`createUser: ${createErr.message}`)
  const userId = created.user.id

  const { data: products } = await admin.from('products').select('id, name').eq('is_active', true).limit(1)
  assert(products?.length, 'no products in DB')

  // BEFORE payment: subscription with null protocol_id + pending_checkout
  const pending = {
    source,
    plan_type: '1mes',
    quiz,
    protocol_items: [
      {
        product_id: products[0].id,
        product_name: products[0].name,
        is_required: false,
        activation_reason: source === 'mini_quiz' ? 'Selecionado por você no carrinho' : 'Recomendado',
        quantity: 1,
      },
    ],
  }

  const { data: sub, error: subErr } = await admin
    .from('subscriptions')
    .insert({
      user_id: userId,
      protocol_id: null,
      pending_checkout: pending,
      plan_type: '1mes',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
      next_billing_at: new Date(Date.now() + 30 * 864e5).toISOString(),
      retry_count: 0,
    })
    .select('id, protocol_id, pending_checkout')
    .single()

  if (subErr) throw new Error(`sub insert (null protocol_id): ${subErr.message}`)

  assert(sub.protocol_id === null, 'protocol_id should be null BEFORE payment')
  assert(sub.pending_checkout?.source === source, 'pending_checkout not stored')
  console.log('✓ BEFORE payment: protocol_id=null, pending_checkout stored')

  // Count protocols for user before payment
  const { count: beforeCount } = await admin
    .from('protocols')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  assert((beforeCount ?? 0) === 0, 'protocol should NOT exist before payment')
  console.log('✓ BEFORE payment: zero protocols for user')

  // Simulate payment confirmation
  const result = await ensureProtocolAfterPayment(sub.id, userId)
  assert(result.created, 'protocol should be created on payment')
  assert(result.source === source, `expected source=${source}, got ${result.source}`)

  const { data: subAfter } = await admin
    .from('subscriptions')
    .select('protocol_id, pending_checkout')
    .eq('id', sub.id)
    .single()

  assert(subAfter.protocol_id === result.protocolId, 'subscription.protocol_id linked')
  assert(subAfter.pending_checkout === null, 'pending_checkout cleared')
  console.log(`✓ AFTER payment: protocol created source=${result.source}, pending cleared`)

  // Idempotency
  const again = await ensureProtocolAfterPayment(sub.id, userId)
  assert(again.created === false, 'second call should be idempotent')
  assert(again.protocolId === result.protocolId, 'same protocol id')
  console.log('✓ Idempotent on second ensureProtocolAfterPayment')

  // Cleanup
  await admin.from('protocol_items').delete().eq('protocol_id', result.protocolId)
  await admin.from('subscriptions').delete().eq('id', sub.id)
  await admin.from('protocols').delete().eq('id', result.protocolId)
  if (result.quizResponseId) await admin.from('quiz_responses').delete().eq('id', result.quizResponseId)
  await admin.from('users').delete().eq('id', userId).maybeSingle?.()
  await admin.auth.admin.deleteUser(userId)
  console.log('✓ cleanup done')
}

async function main() {
  // Schema spot-check via OpenAPI
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  const openapi = await res.json()
  const subReq = openapi?.definitions?.subscriptions?.required ?? []
  const pending = openapi?.definitions?.subscriptions?.properties?.pending_checkout
  const source = openapi?.definitions?.protocols?.properties?.source

  assert(!subReq.includes('protocol_id'), 'protocol_id still required in OpenAPI')
  assert(pending?.format === 'jsonb', 'pending_checkout missing/not jsonb')
  assert(source?.default === 'full_quiz', 'protocols.source default missing')
  console.log('✓ Schema: protocol_id nullable, pending_checkout jsonb, source default full_quiz')

  await runCase('Compra direta (mini_quiz)', 'mini_quiz', {
    diagnosis_type: 'type2',
    full_name: 'Paciente Mini Quiz',
    age: 45,
  })

  await runCase('Quiz completo (full_quiz)', 'full_quiz', {
    diagnosis_type: 'prediabetes',
    years_diagnosed: '1-5anos',
    medications: ['metformina'],
    symptoms: [],
    family_history: [],
    conditions_mild: [],
    conditions_serious: [],
    prior_treatment: [],
    hba1c_range: '7-9',
    fasting_glucose: '100-125',
  })

  console.log('\nAll validations passed.')
}

main().catch((e) => {
  console.error('\nFAILED:', e.message || e)
  process.exit(1)
})
