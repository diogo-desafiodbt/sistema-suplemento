import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'
import { z } from 'zod'
import { garantirPerfil } from '@/lib/auth/garantir-perfil'
import { computeServerCheckoutTotal } from '@/lib/checkout/price'
import { getSql, withTransaction } from '@/lib/db'
import { inngest } from '@/lib/inngest/client'
import {
  addPlanPeriod,
  isRecurringPlan,
  PLAN_LABELS,
  type PurchasePlanType,
} from '@/lib/plans'
import type { PendingCheckoutPayload } from '@/lib/protocol/create-from-checkout'
import { productKeyFromName } from '@/lib/protocol/triage'
import {
  quizMatchesTriageSession,
  verifyTriageSessionToken,
} from '@/lib/quiz/triage-session'
import { summarizePagarmePayload } from '@/lib/security/pagarme'
import { createClient } from '@/lib/supabase/server'
import { TERMS_CONTENT, TERMS_VERSION } from '@/lib/terms/content'

const protocolItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string(),
  is_required: z.boolean().optional(),
  removed: z.boolean().optional(),
  blocked: z.boolean().optional(),
  activation_reason: z.string().optional(),
  quantity: z.number().int().min(1).max(20).optional(),
  price_monthly: z.number().optional(),
  price_quarterly: z.number().optional(),
  price_yearly: z.number().optional(),
  image: z.string().optional(),
})

const checkoutSchema = z.object({
  total_amount: z.number().positive(),
  source: z.enum(['full_quiz', 'mini_quiz']),
  plan_type: z.enum(['1mes', 'assinatura_mensal']),
  installments: z.number().int().min(1).max(6).default(1),
  triage_session_token: z.string().min(20),
  replace_subscription_id: z.string().uuid().optional(),
  quiz: z.object({
    full_name: z.string(),
    age: z.number().int().min(14).max(120),
    birth_date: z.string().optional(),
    sex: z.enum(['homem', 'mulher']),
    is_pregnant_or_breastfeeding: z.boolean(),
    renal_conditions: z.array(z.string()),
    hepatic_conditions: z.array(z.string()),
    diagnosis_type: z.enum([
      'type1',
      'type2',
      'prediabetes',
      'lada_avancado',
      'undiagnosed',
    ]),
    medications: z.array(z.string()),
    allergies: z.string().nullable().optional(),
  }),
  protocol_items: z.array(protocolItemSchema).min(1),
  // Só o nível escolhido. Preço, prazo e serviço vêm da recotação no servidor
  // (computeServerCheckoutTotal), então nada aqui precisa ser confiável — e a
  // transportadora nunca chegou ao cliente para poder voltar.
  shipping: z.object({
    tier: z.enum(['rapido', 'barato', 'custo_beneficio']),
  }),
  address: z.object({
    zip_code: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string().optional(),
    neighborhood: z.string().min(1),
    city: z.string(),
    state: z.string().length(2),
  }),
  payment_method: z.enum(['credit_card', 'pix']),
  terms_accepted: z.literal(true),
  card_token: z.string().min(5).optional(),
  cpf: z.string(),
})

type PlanType = PurchasePlanType

function planItemName(planType: PlanType): string {
  const label = PLAN_LABELS[planType] ?? planType
  return `Desafio Diabetes — ${label}`
}

async function insertPaymentWithRetry(row: Record<string, unknown>) {
  const sql = getSql()
  const tryInsert = async () => {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO payments ${sql(row)}
      RETURNING id
    `
    return rows[0]
  }

  try {
    const data = await tryInsert()
    if (!data?.id) {
      throw new Error('Checkout: payments.insert não retornou id')
    }
    return data
  } catch (error) {
    console.error('Checkout payments.insert error (tentativa 1):', error)
    try {
      const data = await tryInsert()
      if (!data?.id) {
        throw new Error('Checkout: payments.insert não retornou id')
      }
      return data
    } catch (error2) {
      if (
        error2 instanceof postgres.PostgresError &&
        error2.code === '23505'
      ) {
        const chargeId = row.pagarme_charge_id
        if (typeof chargeId === 'string' && chargeId) {
          const existing = await sql<{ id: string }[]>`
            SELECT id FROM payments
            WHERE pagarme_charge_id = ${chargeId}
            LIMIT 1
          `
          if (existing[0]) return existing[0]
        }
      }
      console.error(
        'CRÍTICO — payments.insert falhou 2x; cobrança pode ter sido aprovada sem registro interno:',
        error2,
        {
          subscription_id: row.subscription_id,
          pagarme_charge_id: row.pagarme_charge_id,
          amount: row.amount,
          status: row.status,
        },
      )
      const message =
        error2 instanceof Error ? error2.message : String(error2)
      throw new Error(
        `Checkout: falha ao registrar payment após cobrança (${message})`,
      )
    }
  }
}

/** Ativa subscription + entitlements sem criar protocolo. */
async function activateSubscriptionRow(opts: {
  subscriptionId: string
  userId: string
  expiresAt: Date
}) {
  const sql = getSql()
  const expiresAt = opts.expiresAt.toISOString()
  await sql`
    UPDATE subscriptions
    SET
      status = 'active',
      expires_at = ${expiresAt},
      next_billing_at = ${expiresAt}
    WHERE id = ${opts.subscriptionId}::uuid
  `

  await sql`
    INSERT INTO user_entitlements (user_id, product_key, status, expires_at, is_permanent)
    VALUES (${opts.userId}::uuid, 'treatment', 'active', ${expiresAt}::timestamptz, false)
    ON CONFLICT (user_id, product_key)
    DO UPDATE SET status = EXCLUDED.status, expires_at = EXCLUDED.expires_at
  `
}

async function finalizePaidSubscription(opts: {
  subscriptionId: string
  userId: string
  expiresAt: Date
}) {
  await activateSubscriptionRow(opts)
}

async function recordTermsAcceptance(opts: {
  userId: string
  subscriptionId: string
  ipAddress: string | null
}) {
  const sql = getSql()
  const termsHash = createHash('sha256')
    .update(TERMS_CONTENT + TERMS_VERSION)
    .digest('hex')

  try {
    await sql`
      INSERT INTO terms_acceptances ${sql({
        user_id: opts.userId,
        subscription_id: opts.subscriptionId,
        terms_version: TERMS_VERSION,
        terms_hash: termsHash,
        ip_address: opts.ipAddress,
        accepted_at: new Date().toISOString(),
      })}
    `
  } catch (termsError) {
    console.error('terms_acceptances insert error:', termsError)
  }
}

async function createSubscriptionRow(opts: {
  userId: string
  planType: PlanType
  pendingCheckout: PendingCheckoutPayload
  expiresAt: Date
}) {
  const sql = getSql()
  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO subscriptions ${sql({
        user_id: opts.userId,
        protocol_id: null,
        pending_checkout: opts.pendingCheckout,
        plan_type: opts.planType,
        status: 'pending',
        started_at: new Date().toISOString(),
        expires_at: opts.expiresAt.toISOString(),
        next_billing_at: opts.expiresAt.toISOString(),
        retry_count: 0,
      })}
      RETURNING id
    `
    return rows[0] ?? null
  } catch (subError) {
    console.error('Subscription error:', subError)
    return null
  }
}

type PagarmeBillingAddress = {
  zip_code: string
  city: string
  state: string
  country: string
  line_1: string
}

type ChargeAttemptResult = {
  ok: boolean
  error?: string
  pagarmeId?: string
  paid: boolean
  paymentId?: string
  chargeStatus?: string
  pix?: {
    qr_code: string
    qr_code_url: string
    expires_at: string
  } | null
}

async function chargeOneTimeOrder(opts: {
  subscriptionId: string
  planType: PlanType
  serverTotal: number
  paymentMethod: 'credit_card' | 'pix'
  installments: number
  customer: Record<string, unknown>
  metadata: Record<string, unknown>
  cardToken: string | null
  billingAddress: PagarmeBillingAddress | null
  pagarmeHeaders: Record<string, string>
}): Promise<ChargeAttemptResult> {
  let payments: Array<Record<string, unknown>>
  if (opts.paymentMethod === 'pix') {
    payments = [{ payment_method: 'pix' as const, pix: { expires_in: 3600 } }]
  } else {
    if (!opts.cardToken || !opts.billingAddress) {
      throw new Error(
        'chargeOneTimeOrder: card_token e billing_address são obrigatórios quando paymentMethod é credit_card',
      )
    }
    payments = [
      {
        payment_method: 'credit_card' as const,
        credit_card: {
          recurrence: false,
          installments: opts.installments,
          statement_descriptor: 'DESAF DIABETS',
          card_token: opts.cardToken,
          // billing_address não é tokenizado — vai em card{} junto do token
          card: {
            billing_address: opts.billingAddress,
          },
        },
      },
    ]
  }

  const pagarmePayload = {
    items: [
      {
        amount: Math.round(opts.serverTotal * 100),
        description: planItemName(opts.planType),
        quantity: 1,
        code: `DD-${opts.planType.toUpperCase()}`,
      },
    ],
    customer: opts.customer,
    payments,
    metadata: opts.metadata,
  }

  const pagarmeRes = await fetch('https://api.pagar.me/core/v5/orders', {
    method: 'POST',
    headers: opts.pagarmeHeaders,
    body: JSON.stringify(pagarmePayload),
  })
  const pagarmeData = await pagarmeRes.json()

  if (!pagarmeRes.ok) {
    console.error('Pagar.me order error:', summarizePagarmePayload(pagarmeData))
    return {
      ok: false,
      paid: false,
      error: pagarmeData.message ?? 'Erro no pagamento avulso',
    }
  }

  const charge = pagarmeData.charges?.[0]
  const payment = await insertPaymentWithRetry({
    subscription_id: opts.subscriptionId,
    amount: opts.serverTotal,
    status: charge?.status === 'paid' ? 'paid' : 'pending',
    pagarme_charge_id: charge?.id ?? pagarmeData.id,
    paid_at: charge?.status === 'paid' ? new Date().toISOString() : null,
    webhook_payload: summarizePagarmePayload(pagarmeData),
  })

  const sql = getSql()
  await sql`
    INSERT INTO webhook_logs (source, event_type, payload, processed)
    VALUES (
      'pagarme',
      'order.created',
      ${sql.json(summarizePagarmePayload(pagarmeData) as never)},
      true
    )
  `

  return {
    ok: true,
    paid: charge?.status === 'paid',
    pagarmeId: pagarmeData.id,
    paymentId: payment.id,
    chargeStatus: charge?.status ?? 'pending',
    pix:
      opts.paymentMethod === 'pix' && charge?.last_transaction
        ? {
            qr_code: charge.last_transaction.qr_code,
            qr_code_url: charge.last_transaction.qr_code_url,
            expires_at: charge.last_transaction.expires_at,
          }
        : null,
  }
}

async function chargeSubscription(opts: {
  subscriptionId: string
  planType: PlanType
  serverTotal: number
  customer: Record<string, unknown>
  metadata: Record<string, unknown>
  cardToken: string
  billingAddress: PagarmeBillingAddress
  pagarmeHeaders: Record<string, string>
}): Promise<ChargeAttemptResult> {
  const pagarmeSubscriptionPayload = {
    payment_method: 'credit_card',
    currency: 'BRL',
    interval: 'month',
    interval_count: 1,
    billing_type: 'prepaid',
    installments: 1,
    items: [
      {
        description: planItemName(opts.planType),
        quantity: 1,
        pricing_scheme: {
          scheme_type: 'unit',
          price: Math.round(opts.serverTotal * 100),
        },
      },
    ],
    customer: opts.customer,
    card_token: opts.cardToken,
    card: {
      billing_address: opts.billingAddress,
    },
    metadata: opts.metadata,
  }

  const pagarmeRes = await fetch(
    'https://api.pagar.me/core/v5/subscriptions',
    {
      method: 'POST',
      headers: opts.pagarmeHeaders,
      body: JSON.stringify(pagarmeSubscriptionPayload),
    },
  )
  const pagarmeData = await pagarmeRes.json()

  if (!pagarmeRes.ok) {
    console.error(
      'Pagar.me subscription error:',
      summarizePagarmePayload(pagarmeData),
    )
    return {
      ok: false,
      paid: false,
      error: pagarmeData.message ?? 'Erro no pagamento da assinatura',
    }
  }

  const sql = getSql()
  await sql`
    UPDATE subscriptions
    SET pagarme_sub_id = ${pagarmeData.id}
    WHERE id = ${opts.subscriptionId}::uuid
  `

  const charge = pagarmeData.charges?.[0]
  const cycleStatus = pagarmeData.current_cycle?.status as string | undefined
  // Só considerar pago com evidência de cobrança/ciclo — `active` sozinho
  // pode existir antes da 1ª charge confirmar e liberaria protocolo cedo.
  const paid = charge?.status === 'paid' || cycleStatus === 'paid'

  const cycleChargeId =
    (charge?.id as string | undefined) ??
    (pagarmeData.current_cycle?.id as string | undefined) ??
    pagarmeData.id

  const payment = await insertPaymentWithRetry({
    subscription_id: opts.subscriptionId,
    amount: opts.serverTotal,
    status: paid ? 'paid' : 'pending',
    pagarme_charge_id: cycleChargeId,
    paid_at: paid ? new Date().toISOString() : null,
    webhook_payload: summarizePagarmePayload(pagarmeData),
  })

  await sql`
    INSERT INTO webhook_logs (source, event_type, payload, processed)
    VALUES (
      'pagarme',
      'subscription.created',
      ${sql.json(summarizePagarmePayload(pagarmeData) as never)},
      true
    )
  `

  return {
    ok: true,
    paid,
    pagarmeId: pagarmeData.id,
    paymentId: payment.id,
    chargeStatus: charge?.status ?? cycleStatus ?? pagarmeData.status ?? 'pending',
  }
}

function isCardDeclinedStatus(status: string | undefined): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return (
    s === 'failed' ||
    s === 'canceled' ||
    s === 'cancelled' ||
    s === 'not_authorized' ||
    s === 'refused'
  )
}

async function cancelPagarmeSubscriptionBestEffort(
  pagarmeSubId: string,
  pagarmeHeaders: Record<string, string>,
): Promise<void> {
  try {
    const res = await fetch(
      `https://api.pagar.me/core/v5/subscriptions/${pagarmeSubId}`,
      {
        method: 'DELETE',
        headers: pagarmeHeaders,
      },
    )
    if (res.ok || res.status === 404) return

    const body = await res.text()
    const lower = body.toLowerCase()
    // Só tratar como "já cancelada" com evidência no corpo — 422 genérico pode ser outro erro.
    const alreadyCanceled =
      lower.includes('cancel') ||
      lower.includes('not found') ||
      lower.includes('already')
    if (alreadyCanceled) return

    console.error(
      'cancelPagarmeSubscriptionBestEffort: falha ao cancelar',
      pagarmeSubId,
      res.status,
      body,
    )
  } catch (error) {
    console.error('cancelPagarmeSubscriptionBestEffort error:', error)
  }
}

async function deleteSubscriptionLocal(subscriptionId: string) {
  await withTransaction(async (tx) => {
    await tx`
      UPDATE terms_acceptances
      SET subscription_id = NULL
      WHERE subscription_id = ${subscriptionId}::uuid
    `
    await tx`
      DELETE FROM payments WHERE subscription_id = ${subscriptionId}::uuid
    `
    await tx`
      DELETE FROM subscriptions WHERE id = ${subscriptionId}::uuid
    `
  })
}

async function deleteFailedSubscription(
  subscriptionId: string,
  pagarmeHeaders?: Record<string, string>,
) {
  if (pagarmeHeaders) {
    const sql = getSql()
    const rows = await sql<{ pagarme_sub_id: string | null }[]>`
      SELECT pagarme_sub_id FROM subscriptions
      WHERE id = ${subscriptionId}::uuid
      LIMIT 1
    `
    if (rows[0]?.pagarme_sub_id) {
      await cancelPagarmeSubscriptionBestEffort(
        rows[0].pagarme_sub_id,
        pagarmeHeaders,
      )
    }
  }

  await deleteSubscriptionLocal(subscriptionId)
}

/** Cancela cobrança/pedido Pix pendente no Pagar.me (best effort). */
async function cancelPagarmePendingOrder(
  orderOrChargeId: string,
  pagarmeHeaders: Record<string, string>,
): Promise<void> {
  try {
    const patchRes = await fetch(
      `https://api.pagar.me/core/v5/orders/${orderOrChargeId}/closed`,
      {
        method: 'PATCH',
        headers: pagarmeHeaders,
        body: JSON.stringify({ status: 'canceled' }),
      },
    )
    if (patchRes.ok || patchRes.status === 404) return

    const delRes = await fetch(
      `https://api.pagar.me/core/v5/charges/${orderOrChargeId}`,
      {
        method: 'DELETE',
        headers: pagarmeHeaders,
      },
    )
    if (!delRes.ok && delRes.status !== 404) {
      const body = await delRes.text()
      console.error(
        'cancelPagarmePendingOrder: falha ao cancelar charge/order',
        orderOrChargeId,
        delRes.status,
        body,
      )
    }
  } catch (error) {
    console.error('cancelPagarmePendingOrder error:', error)
  }
}

async function replacePendingPixSubscription(opts: {
  userId: string
  replaceSubscriptionId: string
  pagarmeHeaders: Record<string, string>
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const sql = getSql()
  const prevRows = await sql<
    { id: string; user_id: string; status: string }[]
  >`
    SELECT id, user_id, status FROM subscriptions
    WHERE id = ${opts.replaceSubscriptionId}::uuid
    LIMIT 1
  `
  const prev = prevRows[0] ?? null

  if (!prev || prev.user_id !== opts.userId) {
    return {
      ok: false,
      error: 'Assinatura Pix anterior inválida',
      status: 400,
    }
  }
  if (prev.status !== 'pending') {
    return {
      ok: false,
      error: 'Assinatura Pix anterior não está pendente',
      status: 400,
    }
  }

  const payments = await sql<{ id: string; pagarme_charge_id: string | null }[]>`
    SELECT id, pagarme_charge_id FROM payments
    WHERE subscription_id = ${opts.replaceSubscriptionId}::uuid
  `

  for (const payment of payments) {
    if (
      typeof payment.pagarme_charge_id === 'string' &&
      payment.pagarme_charge_id
    ) {
      await cancelPagarmePendingOrder(
        payment.pagarme_charge_id,
        opts.pagarmeHeaders,
      )
    }
  }

  await deleteSubscriptionLocal(opts.replaceSubscriptionId)

  return { ok: true }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()

    if (body?.terms_accepted !== true) {
      return NextResponse.json(
        { error: 'É necessário aceitar os Termos de Uso' },
        { status: 400 },
      )
    }

    const parsed = checkoutSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const data = parsed.data
    const planType = data.plan_type

    const triageSession = verifyTriageSessionToken(data.triage_session_token)
    if (!triageSession) {
      return NextResponse.json(
        { error: 'Sessão de triagem inválida ou expirada. Refaça o quiz.' },
        { status: 400 },
      )
    }
    if (!quizMatchesTriageSession(data.quiz, triageSession)) {
      return NextResponse.json(
        { error: 'Dados da triagem não conferem com a sessão. Refaça o quiz.' },
        { status: 400 },
      )
    }

    if (data.payment_method === 'pix' && planType !== '1mes') {
      return NextResponse.json(
        { error: 'Pix disponível apenas na compra única' },
        { status: 400 },
      )
    }

    const installments =
      planType === 'assinatura_mensal' ? 1 : data.installments

    if (data.payment_method === 'pix' && installments > 1) {
      return NextResponse.json(
        { error: 'Parcelamento disponível apenas no cartão de crédito' },
        { status: 400 },
      )
    }

    if (data.payment_method === 'credit_card' && !data.card_token) {
      return NextResponse.json(
        { error: 'Token do cartão é obrigatório' },
        { status: 400 },
      )
    }

    if (isRecurringPlan(planType) && data.payment_method !== 'credit_card') {
      return NextResponse.json(
        { error: 'Assinatura disponível apenas no cartão de crédito' },
        { status: 400 },
      )
    }

    const activeItems = data.protocol_items.filter(
      (i) => !i.removed && !i.blocked,
    )

    if (activeItems.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum item ativo no protocolo' },
        { status: 400 },
      )
    }

    const allowedSet = new Set(triageSession.allowed)
    for (const item of activeItems) {
      const key = productKeyFromName(item.product_name)
      if (!key || !allowedSet.has(key)) {
        return NextResponse.json(
          {
            error:
              'Produto não autorizado pela triagem. Refaça o quiz ou revise o protocolo.',
          },
          { status: 400 },
        )
      }
    }

    const sql = getSql()

    const metaName = user.user_metadata?.full_name
    await garantirPerfil({
      id: user.id,
      email: user.email ?? '',
      fullName: typeof metaName === 'string' ? metaName : null,
    })

    const profileRows = await sql<
      { full_name: string; email: string; client_code: string }[]
    >`
      SELECT full_name, email, client_code FROM users
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `
    const profile = profileRows[0]

    if (!profile) {
      return NextResponse.json(
        { error: 'Perfil não encontrado' },
        { status: 404 },
      )
    }

    try {
      await sql`
        INSERT INTO addresses ${sql({
          user_id: user.id,
          zip_code: data.address.zip_code,
          street: data.address.street,
          number: data.address.number,
          complement: data.address.complement ?? '',
          neighborhood: data.address.neighborhood,
          city: data.address.city,
          state: data.address.state,
          is_default: true,
        })}
        ON CONFLICT (user_id) DO UPDATE SET
          zip_code = EXCLUDED.zip_code,
          street = EXCLUDED.street,
          number = EXCLUDED.number,
          complement = EXCLUDED.complement,
          neighborhood = EXCLUDED.neighborhood,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          is_default = EXCLUDED.is_default
      `
    } catch (addressError) {
      console.error('addresses upsert error:', addressError)
      throw addressError
    }

    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || null

    const pagarmeAuth = `Basic ${Buffer.from(`${process.env.PAGARME_API_KEY}:`).toString('base64')}`
    const pagarmeHeaders = {
      'Content-Type': 'application/json',
      Authorization: pagarmeAuth,
    }

    if (data.replace_subscription_id) {
      const replaced = await replacePendingPixSubscription({
        userId: user.id,
        replaceSubscriptionId: data.replace_subscription_id,
        pagarmeHeaders,
      })
      if (!replaced.ok) {
        return NextResponse.json(
          { error: replaced.error },
          { status: replaced.status },
        )
      }
    }

    const customer = {
      name: profile.full_name,
      email: profile.email,
      type: 'individual' as const,
      document: data.cpf.replace(/\D/g, ''),
      document_type: 'CPF' as const,
      phones: {
        mobile_phone: {
          country_code: '55',
          area_code: '11',
          number: '999999999',
        },
      },
    }

    const billingAddress: PagarmeBillingAddress | null =
      data.payment_method === 'credit_card'
        ? {
            zip_code: data.address.zip_code,
            city: data.address.city,
            state: data.address.state,
            country: 'BR',
            line_1: `${data.address.number}, ${data.address.street}, ${data.address.neighborhood}`,
          }
        : null

    const cardToken = data.card_token ?? null

    const priced = await computeServerCheckoutTotal({
      planType,
      protocolItems: activeItems,
      shipping: data.shipping,
      address: data.address,
      includeShipping: true,
    })
    if (!priced.ok) {
      return NextResponse.json({ error: priced.error }, { status: 400 })
    }
    if (Math.abs(data.total_amount - priced.priced.serverTotal) > 0.01) {
      return NextResponse.json(
        {
          error:
            'Valor do pedido desatualizado. Recarregue o frete e tente de novo.',
          server_total: priced.priced.serverTotal,
        },
        { status: 400 },
      )
    }
    const serverTotal = priced.priced.serverTotal
    const shipping = priced.priced.shipping

    const expiresAt = addPlanPeriod(new Date(), planType)

    const pendingCheckout: PendingCheckoutPayload = {
      source: data.source,
      plan_type: data.plan_type,
      shipping,
      quiz: data.quiz,
      protocol_items: activeItems,
    }

    const subscription = await createSubscriptionRow({
      userId: user.id,
      planType,
      pendingCheckout,
      expiresAt,
    })

    if (!subscription) {
      return NextResponse.json(
        { error: 'Erro ao criar assinatura' },
        { status: 500 },
      )
    }

    await recordTermsAcceptance({
      userId: user.id,
      subscriptionId: subscription.id,
      ipAddress,
    })

    const metadata = {
      subscription_id: subscription.id,
      user_id: user.id,
      plan_type: planType,
      client_code: profile.client_code,
    }

    const result = isRecurringPlan(planType)
      ? await chargeSubscription({
          subscriptionId: subscription.id,
          planType,
          serverTotal,
          customer,
          metadata,
          cardToken: cardToken!,
          billingAddress: billingAddress!,
          pagarmeHeaders,
        })
      : await chargeOneTimeOrder({
          subscriptionId: subscription.id,
          planType,
          serverTotal,
          paymentMethod: data.payment_method,
          installments,
          customer,
          metadata,
          cardToken,
          billingAddress,
          pagarmeHeaders,
        })

    if (!result.ok) {
      await deleteFailedSubscription(subscription.id, pagarmeHeaders)
      return NextResponse.json(
        { error: result.error ?? 'Erro no pagamento' },
        { status: 400 },
      )
    }

    // Cartão: avulso não pago = recusa imediata.
    // Assinatura: só apaga se a charge veio explicitamente recusada; se ainda
    // estiver pending/active sem `paid`, mantém local+remota e espera webhook.
    if (!result.paid && data.payment_method === 'credit_card') {
      const waitForWebhook =
        isRecurringPlan(planType) &&
        !isCardDeclinedStatus(result.chargeStatus)

      if (!waitForWebhook) {
        await deleteFailedSubscription(subscription.id, pagarmeHeaders)
        return NextResponse.json(
          { error: 'Pagamento não autorizado. Tente outro cartão.' },
          { status: 400 },
        )
      }
    }

    if (result.paid) {
      await finalizePaidSubscription({
        subscriptionId: subscription.id,
        userId: user.id,
        expiresAt,
      })
      try {
        await inngest.send({
          name: 'pagamento/confirmado',
          data: {
            subscription_id: subscription.id,
            user_id: user.id,
            payment_id: result.paymentId,
          },
        })
      } catch (inngestError) {
        console.error('Erro ao disparar pagamento/confirmado:', inngestError)
      }
    }

    const resultKey = isRecurringPlan(planType) ? 'subscription' : 'oneTime'

    return NextResponse.json({
      ok: true,
      order_id: result.pagarmeId,
      status: result.chargeStatus ?? 'pending',
      subscription_id: subscription.id,
      protocol_id: null,
      results: {
        [resultKey]: {
          ok: true,
          paid: result.paid,
          order_id: result.pagarmeId,
          status: result.chargeStatus ?? 'pending',
          ...(result.pix ? { pix: result.pix } : {}),
        },
      },
      ...(data.payment_method === 'pix' && result.pix
        ? { pix: result.pix }
        : {}),
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
