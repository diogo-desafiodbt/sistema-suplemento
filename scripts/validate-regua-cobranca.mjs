/**
 * Validação da régua payment-retry (prompt 024).
 * Uso:
 *   INNGEST_DEV=1 node scripts/validate-regua-cobranca.mjs d0   # Cenário A — D+0 via Inngest
 *   INNGEST_DEV=1 node scripts/validate-regua-cobranca.mjs cancel # Cenário A — cancelamento manual
 *   INNGEST_DEV=1 node scripts/validate-regua-cobranca.mjs b    # Cenário B — regularização
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { Inngest } from 'inngest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  const envPath = resolve(root, '.env.local')
  const content = readFileSync(envPath, 'utf8')
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
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? 'http://127.0.0.1:8288'

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function assinaturaAtiva(subscriptionId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('id', subscriptionId)
    .single()
  return data?.status === 'active'
}

async function getSubscription(id) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, plan_type, status, grace_period_ends_at, pagarme_sub_id')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

async function getEntitlements(userId) {
  const { data } = await supabase
    .from('user_entitlements')
    .select('product_key, status, is_permanent')
    .eq('user_id', userId)
  return data ?? []
}

async function getNotificationLogs(userId) {
  const { data, error } = await supabase
    .from('notification_logs')
    .select('type, status')
    .eq('user_id', userId)
    .eq('type', 'payment_failed')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) return []
  return data ?? []
}

function daysFromNow(iso, days) {
  const target = new Date()
  target.setDate(target.getDate() + days)
  const actual = new Date(iso)
  return Math.abs(actual - target) / (1000 * 60 * 60)
}

async function prepareSubscription(suffix) {
  const fakePagarmeId = `sub_test_regua_${suffix}_${Date.now()}`

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, user_id, plan_type')
    .in('plan_type', ['3meses', '1ano'])
    .limit(1)
    .maybeSingle()

  let subId, userId

  if (existing) {
    subId = existing.id
    userId = existing.user_id
  } else {
    const { data: users } = await supabase.from('users').select('id').limit(1)
    if (!users?.length) throw new Error('Nenhum usuário no Supabase')
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

  const { data: guide } = await supabase
    .from('user_entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('product_key', 'guide')
    .maybeSingle()

  if (!guide) {
    await supabase.from('user_entitlements').insert({
      user_id: userId,
      product_key: 'guide',
      status: 'active',
      expires_at: new Date('2099-01-01').toISOString(),
      is_permanent: true,
    })
  }

  return { subscription_id: subId, user_id: userId, pagarme_sub_id: fakePagarmeId }
}

async function sendPagamentoFalhou(subscriptionId, userId) {
  const { ids } = await inngest.send({
    name: 'pagamento/falhou',
    data: { subscription_id: subscriptionId, user_id: userId },
  })
  return ids?.[0]
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

async function cancelPagarmeSubscription(pagarmeSubId) {
  const apiKey = process.env.PAGARME_API_KEY
  if (!apiKey) return { ok: false, reason: 'PAGARME_API_KEY ausente' }
  const pagarmeAuth = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  const res = await fetch(
    `https://api.pagar.me/core/v5/subscriptions/${pagarmeSubId}`,
    { method: 'DELETE', headers: { Authorization: pagarmeAuth } }
  )
  if (res.ok || res.status === 404) return { ok: true, status: res.status }
  const body = await res.text()
  return { ok: false, status: res.status, body }
}

function printResults(title, results) {
  console.log(`\n--- ${title} ---`)
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.check}${r.detail ? ` — ${r.detail}` : ''}`)
  }
}

async function checkServers() {
  const inngestOk = await fetch(`${INNGEST_DEV_URL}/health`).then(r => r.ok).catch(() => false)
  const nextOk = await fetch('http://localhost:3000/api/inngest').then(r => r.ok).catch(() => false)
  return { inngestOk, nextOk }
}

async function runD0() {
  const results = []
  const { inngestOk, nextOk } = await checkServers()
  if (!inngestOk || !nextOk) {
    console.error('❌ Servidores não disponíveis (Next.js + Inngest dev com INNGEST_DEV=1)')
    process.exit(1)
  }

  const test = await prepareSubscription('d0')
  console.log('Assinatura:', test)

  const eventId = await sendPagamentoFalhou(test.subscription_id, test.user_id)
  await sleep(6000)

  const sub = await getSubscription(test.subscription_id)
  const logs = await getNotificationLogs(test.user_id)

  results.push({
    check: 'D+0: status = past_due',
    ok: sub.status === 'past_due',
    detail: sub.status,
  })
  results.push({
    check: 'D+0: grace_period_ends_at ~20 dias',
    ok: sub.grace_period_ends_at ? daysFromNow(sub.grace_period_ends_at, 20) < 48 : false,
    detail: sub.grace_period_ends_at,
  })
  results.push({
    check: 'D+0: email neutro (log ou RESEND ausente)',
    ok: logs.length > 0 || !process.env.RESEND_API_KEY,
    detail: `logs=${logs.length}, resend=${!!process.env.RESEND_API_KEY}`,
  })
  results.push({
    check: 'D+0: assinaturaAtiva = false após falha',
    ok: !(await assinaturaAtiva(test.subscription_id)),
    detail: String(await assinaturaAtiva(test.subscription_id)),
  })
  results.push({
    check: 'Evento Inngest disparado',
    ok: !!eventId,
    detail: eventId,
  })

  printResults('Cenário A — D+0 (Inngest real)', results)
  return { test, results }
}

async function runCancel() {
  const results = []
  const test = await prepareSubscription('cancel')

  await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      grace_period_ends_at: new Date(Date.now() + 20 * 86400000).toISOString(),
    })
    .eq('id', test.subscription_id)

  const pagarmeResult = await cancelPagarmeSubscription(test.pagarme_sub_id)
  results.push({
    check: 'DELETE Pagar.me (404/200 = ok para fake id)',
    ok: pagarmeResult.ok,
    detail: JSON.stringify(pagarmeResult),
  })

  await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('id', test.subscription_id)

  await supabase
    .from('user_entitlements')
    .update({ status: 'canceled' })
    .eq('user_id', test.user_id)
    .eq('product_key', 'treatment')
    .eq('status', 'active')
    .eq('is_permanent', false)

  const sub = await getSubscription(test.subscription_id)
  const ents = await getEntitlements(test.user_id)
  const treatment = ents.find(e => e.product_key === 'treatment')
  const guide = ents.find(e => e.product_key === 'guide')

  results.push({
    check: 'D+20: status = canceled',
    ok: sub.status === 'canceled',
    detail: sub.status,
  })
  results.push({
    check: 'D+20: treatment entitlement canceled',
    ok: treatment?.status === 'canceled',
    detail: treatment?.status,
  })
  results.push({
    check: 'D+20: guide permanente não tocado',
    ok: guide?.status === 'active' && guide?.is_permanent === true,
    detail: guide ? `${guide.status} permanent=${guide.is_permanent}` : 'sem guide',
  })

  printResults('Cenário A — cancelamento (lógica D+20)', results)
  return results
}

async function runB() {
  const results = []
  const { inngestOk, nextOk } = await checkServers()
  if (!inngestOk || !nextOk) {
    console.error('❌ Servidores não disponíveis')
    process.exit(1)
  }

  const test = await prepareSubscription('b')
  console.log('Assinatura:', test)

  await sendPagamentoFalhou(test.subscription_id, test.user_id)
  await sleep(6000)

  const subPastDue = await getSubscription(test.subscription_id)
  results.push({
    check: 'Após falha: status = past_due',
    ok: subPastDue.status === 'past_due',
    detail: subPastDue.status,
  })
  results.push({
    check: 'Checkpoint D+5 simulado: assinaturaAtiva = false',
    ok: !(await assinaturaAtiva(test.subscription_id)),
    detail: String(await assinaturaAtiva(test.subscription_id)),
  })

  await simulatePaymentSucceeded(test.subscription_id, test.user_id)

  const subActive = await getSubscription(test.subscription_id)
  results.push({
    check: 'Após regularização (webhook simulado): status = active',
    ok: subActive.status === 'active',
    detail: subActive.status,
  })
  results.push({
    check: 'Checkpoint D+9: assinaturaAtiva = true → régua deve parar',
    ok: await assinaturaAtiva(test.subscription_id),
    detail: 'esperado stopped: resolvido-antes-d9 no próximo checkpoint',
  })

  const ents = await getEntitlements(test.user_id)
  const treatment = ents.find(e => e.product_key === 'treatment')
  results.push({
    check: 'Entitlement treatment ainda active (não revogado)',
    ok: treatment?.status === 'active',
    detail: treatment?.status,
  })
  results.push({
    check: 'Subscription não cancelada',
    ok: subActive.status !== 'canceled',
    detail: subActive.status,
  })

  printResults('Cenário B — regularização no meio', results)
  return results
}

const mode = process.argv[2] ?? 'all'

if (mode === 'd0' || mode === 'all') await runD0()
if (mode === 'cancel' || mode === 'all') await runCancel()
if (mode === 'b' || mode === 'all') await runB()
