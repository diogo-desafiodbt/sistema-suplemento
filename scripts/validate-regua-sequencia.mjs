/**
 * Validação E2E da sequência completa (prompt 025) — função acelerada payment-retry-teste.
 * Uso: INNGEST_DEV=1 node scripts/validate-regua-sequencia.mjs [a|b|all]
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { Inngest } from 'inngest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  const content = readFileSync(resolve(root, '.env.local'), 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const inngest = new Inngest({ id: 'desafio-diabetes', name: 'Desafio Diabetes' })
const GQL = 'http://127.0.0.1:8288/v0/gql'

const EXPECTED_STEPS_A = [
  'validar-plano',
  'marcar-past-due-e-notificar',
  'checar-d2',
  'lembrete-d2',
  'checar-d5',
  'lembrete-d5',
  'checar-d9',
  'lembrete-d9',
  'checar-fim-grace',
  'cancelar-no-pagarme',
  'cancelar-assinatura',
]

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

async function prepareSubscription(suffix) {
  const fakePagarmeId = `sub_test_seq_${suffix}_${Date.now()}`

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, user_id')
    .in('plan_type', ['3meses', '1ano'])
    .limit(1)
    .maybeSingle()

  let subId, userId
  if (existing) {
    subId = existing.id
    userId = existing.user_id
  } else {
    const { data: users } = await supabase.from('users').select('id').limit(1)
    if (!users?.length) throw new Error('Sem usuários no Supabase')
    userId = users[0].id
    const expires = new Date()
    expires.setMonth(expires.getMonth() + 3)
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_type: '3meses',
        status: 'active',
        pagarme_sub_id: fakePagarmeId,
        expires_at: expires.toISOString(),
        next_billing_at: expires.toISOString(),
      })
      .select('id')
      .single()
    if (error) throw error
    subId = sub.id
    await supabase.from('user_entitlements').upsert({
      user_id: userId,
      product_key: 'treatment',
      status: 'active',
      expires_at: expires.toISOString(),
      is_permanent: false,
    })
  }

  await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      grace_period_ends_at: null,
      pagarme_sub_id: fakePagarmeId,
    })
    .eq('id', subId)

  await supabase
    .from('user_entitlements')
    .update({ status: 'active' })
    .eq('user_id', userId)
    .eq('product_key', 'treatment')

  return { subscription_id: subId, user_id: userId }
}

async function sendTestEvent(subscriptionId, userId) {
  const { ids } = await inngest.send({
    name: 'pagamento/falhou-teste',
    data: { subscription_id: subscriptionId, user_id: userId },
  })
  return ids?.[0]
}

async function waitForRunByEvent(eventId, timeoutMs = 180000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const data = await gql(
      `{ eventsV2(first: 5, filter: { eventNames: ["pagamento/falhou-teste"] }) { edges { node { id name runs { id status endedAt output } } } } } }`
    )
    const events = data?.data?.eventsV2?.edges ?? []
    const match = events.find(e => e.node.id === eventId)
    const run = match?.node?.runs?.[0]
    if (run?.status === 'COMPLETED' || run?.status === 'FAILED') {
      return run
    }
    await sleep(2000)
  }
  return null
}

async function getRunTrace(runId) {
  const data = await gql(
    `{ run(query: { runID: "${runId}" }) { status output endedAt trace { spans { name status outputID } } } }`
  )
  return data?.data?.run
}

async function getSpanOutput(outputId) {
  if (!outputId) return null
  const data = await gql(
    `{ runTraceSpanOutputByID(outputID: "${outputId}") { data } }`
  )
  return data?.data?.runTraceSpanOutputByID?.data
}

async function collectStepSequence(runId) {
  const run = await getRunTrace(runId)
  if (!run?.trace?.spans) return { run, steps: [] }

  const steps = []
  for (const span of run.trace.spans) {
    if (!span.name || span.name.startsWith('aguardar-')) continue
    const output = await getSpanOutput(span.outputID)
    steps.push({ name: span.name, status: span.status, output })
  }
  return { run, steps }
}

async function simulatePaymentSucceeded(subscriptionId, userId) {
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 3)
  await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      expires_at: expiresAt.toISOString(),
      next_billing_at: expiresAt.toISOString(),
    })
    .eq('id', subscriptionId)

  await supabase
    .from('user_entitlements')
    .update({ status: 'active', expires_at: expiresAt.toISOString() })
    .eq('user_id', userId)
    .eq('product_key', 'treatment')
}

async function runScenarioA() {
  console.log('\n=== CENÁRIO A — sequência completa até cancelamento ===\n')
  const test = await prepareSubscription('a')
  console.log('Assinatura:', test)

  const eventId = await sendTestEvent(test.subscription_id, test.user_id)
  console.log('Evento:', eventId)

  const run = await waitForRunByEvent(eventId, 180000)
  if (!run) {
    console.log('❌ Timeout aguardando conclusão da run')
    return
  }

  const { run: trace, steps } = await collectStepSequence(run.id)
  const stepNames = steps.map(s => s.name)

  console.log('\nSteps executados (ordem):')
  steps.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.name} — output: ${JSON.stringify(s.output)}`)
  })
  console.log('\nRetorno final:', trace?.output)

  const orderOk = JSON.stringify(stepNames) === JSON.stringify(EXPECTED_STEPS_A)
  const finalOk = trace?.output?.result === 'canceled'
  const sub = await supabase
    .from('subscriptions')
    .select('status')
    .eq('id', test.subscription_id)
    .single()

  console.log(`\n${orderOk ? '✅' : '❌'} Ordem dos steps`)
  console.log(`${finalOk ? '✅' : '❌'} Retorno final { result: 'canceled' }`)
  console.log(`${sub.data?.status === 'canceled' ? '✅' : '❌'} subscriptions.status = canceled (${sub.data?.status})`)

  if (!orderOk) {
    console.log('\nEsperado:', EXPECTED_STEPS_A.join(' → '))
    console.log('Obtido: ', stepNames.join(' → '))
  }
}

async function runScenarioB() {
  console.log('\n=== CENÁRIO B — regularização no meio da régua ===\n')
  const test = await prepareSubscription('b')
  console.log('Assinatura:', test)

  const eventId = await sendTestEvent(test.subscription_id, test.user_id)
  console.log('Evento:', eventId)

  // Aguarda passar D+0 + aguardar-d2 (10s) + checar-d2 + lembrete-d2 (~15s total)
  console.log('Aguardando ~18s para passar D+0 e D+2...')
  await sleep(18000)

  const subMid = await supabase
    .from('subscriptions')
    .select('status')
    .eq('id', test.subscription_id)
    .single()
  console.log('Status antes da regularização:', subMid.data?.status)

  await simulatePaymentSucceeded(test.subscription_id, test.user_id)
  console.log('Regularização simulada (status → active)')

  const run = await waitForRunByEvent(eventId, 120000)
  if (!run) {
    console.log('❌ Timeout aguardando conclusão')
    return
  }

  const { run: trace, steps } = await collectStepSequence(run.id)
  const stepNames = steps.map(s => s.name)

  console.log('\nSteps executados (ordem):')
  steps.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.name} — output: ${JSON.stringify(s.output)}`)
  })
  console.log('\nRetorno final:', trace?.output)

  const stoppedOk =
    trace?.output?.stopped === 'resolvido-antes-d5' ||
    trace?.output?.stopped === 'resolvido-antes-d9'
  const noCancelSteps = !stepNames.includes('cancelar-assinatura')
  const noLembreteAfterStop =
    !stepNames.includes('lembrete-d9') && !stepNames.includes('cancelar-no-pagarme')
  const sub = await supabase
    .from('subscriptions')
    .select('status')
    .eq('id', test.subscription_id)
    .single()

  console.log(`\n${stoppedOk ? '✅' : '❌'} Parou com stopped resolvido-antes-d5/d9 (${trace?.output?.stopped})`)
  console.log(`${noCancelSteps ? '✅' : '❌'} Não executou cancelar-assinatura`)
  console.log(`${noLembreteAfterStop ? '✅' : '❌'} Não executou lembrete-d9 nem cancelar-no-pagarme`)
  console.log(`${sub.data?.status === 'active' ? '✅' : '❌'} Subscription ainda active (${sub.data?.status})`)
}

const mode = process.argv[2] ?? 'all'
if (mode === 'a' || mode === 'all') await runScenarioA()
if (mode === 'b' || mode === 'all') await runScenarioB()
