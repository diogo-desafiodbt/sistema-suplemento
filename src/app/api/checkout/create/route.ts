import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { computeServerCheckoutTotal } from '@/lib/checkout/price'
import { inngest } from '@/lib/inngest/client'
import { addPlanPeriod, PLAN_LABELS, type PurchasePlanType } from '@/lib/plans'
import type { PendingCheckoutPayload } from '@/lib/protocol/create-from-checkout'
import { ensureProtocolAfterPayment } from '@/lib/protocol/create-from-checkout'
import { summarizePagarmePayload } from '@/lib/security/pagarme'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TERMS_CONTENT, TERMS_VERSION } from '@/lib/terms/content'

const protocolItemSchema = z.object({
  product_id: z.string().uuid().optional(),
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
  plan_type: z.enum(['1mes', '3meses', '6meses']),
  quiz: z.object({
    full_name: z.string(),
    birth_date: z.string(),
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
  }),
  protocol_items: z.array(protocolItemSchema).min(1),
  shipping: z.object({
    tipo: z.enum(['economica', 'expressa', 'padrao']),
    valor: z.number().nonnegative(),
    prazoDias: z.number().nonnegative(),
    codigoServico: z.string(),
    transportadora: z.string().optional(),
    nomeServico: z.string().optional(),
  }),
  address: z.object({
    zip_code: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string().optional(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string().length(2),
  }),
  payment_method: z.enum(['credit_card', 'pix']),
  terms_accepted: z.literal(true),
  card: z
    .object({
      number: z.string(),
      holder_name: z.string(),
      exp_month: z.string(),
      exp_year: z.string(),
      cvv: z.string(),
    })
    .optional(),
  cpf: z.string(),
})

type AdminClient = ReturnType<typeof createAdminClient>
type PlanType = PurchasePlanType

function planItemName(planType: PlanType): string {
  const label = PLAN_LABELS[planType] ?? planType
  return `Desafio Diabetes — ${label}`
}

async function insertPaymentWithRetry(
  admin: AdminClient,
  row: Record<string, unknown>,
) {
  let { data, error } = await admin
    .from('payments')
    .insert(row)
    .select('id')
    .single()
  if (error) {
    console.error('Checkout payments.insert error (tentativa 1):', error)
    ;({ data, error } = await admin
      .from('payments')
      .insert(row)
      .select('id')
      .single())
  }
  if (error?.code === '23505') {
    const chargeId = row.pagarme_charge_id
    if (typeof chargeId === 'string' && chargeId) {
      const { data: existing } = await admin
        .from('payments')
        .select('id')
        .eq('pagarme_charge_id', chargeId)
        .maybeSingle()
      if (existing) return existing
    }
  }
  if (error) {
    console.error(
      'CRÍTICO — payments.insert falhou 2x; cobrança pode ter sido aprovada sem registro interno:',
      error,
      {
        subscription_id: row.subscription_id,
        pagarme_charge_id: row.pagarme_charge_id,
        amount: row.amount,
        status: row.status,
      },
    )
    throw new Error(
      `Checkout: falha ao registrar payment após cobrança (${error.message})`,
    )
  }
  if (!data?.id) {
    throw new Error('Checkout: payments.insert não retornou id')
  }
  return data
}

/** Ativa subscription + entitlements sem criar protocolo. */
async function activateSubscriptionRow(
  admin: AdminClient,
  opts: {
    subscriptionId: string
    userId: string
    expiresAt: Date
  },
) {
  await admin
    .from('subscriptions')
    .update({
      status: 'active',
      expires_at: opts.expiresAt.toISOString(),
      next_billing_at: opts.expiresAt.toISOString(),
    })
    .eq('id', opts.subscriptionId)

  const { data: existing } = await admin
    .from('user_entitlements')
    .select('id')
    .eq('user_id', opts.userId)
    .eq('product_key', 'treatment')
    .maybeSingle()

  if (existing) {
    await admin
      .from('user_entitlements')
      .update({
        status: 'active',
        expires_at: opts.expiresAt.toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await admin.from('user_entitlements').insert({
      user_id: opts.userId,
      product_key: 'treatment',
      status: 'active',
      expires_at: opts.expiresAt.toISOString(),
      is_permanent: false,
    })
  }
}

async function finalizePaidSubscription(
  admin: AdminClient,
  opts: {
    subscriptionId: string
    userId: string
    expiresAt: Date
  },
) {
  await activateSubscriptionRow(admin, opts)
  return ensureProtocolAfterPayment(admin, opts.subscriptionId, opts.userId)
}

async function recordTermsAcceptance(
  admin: AdminClient,
  opts: {
    userId: string
    subscriptionId: string
    ipAddress: string | null
  },
) {
  const termsHash = createHash('sha256')
    .update(TERMS_CONTENT + TERMS_VERSION)
    .digest('hex')

  const { error: termsError } = await admin.from('terms_acceptances').insert({
    user_id: opts.userId,
    subscription_id: opts.subscriptionId,
    terms_version: TERMS_VERSION,
    terms_hash: termsHash,
    ip_address: opts.ipAddress,
    accepted_at: new Date().toISOString(),
  })

  if (termsError) {
    console.error('terms_acceptances insert error:', termsError)
  }
}

async function createSubscriptionRow(
  admin: AdminClient,
  opts: {
    userId: string
    planType: PlanType
    pendingCheckout: PendingCheckoutPayload
    expiresAt: Date
  },
) {
  const { data: subscription, error: subError } = await admin
    .from('subscriptions')
    .insert({
      user_id: opts.userId,
      protocol_id: null,
      pending_checkout: opts.pendingCheckout,
      plan_type: opts.planType,
      status: 'pending',
      started_at: new Date().toISOString(),
      expires_at: opts.expiresAt.toISOString(),
      next_billing_at: opts.expiresAt.toISOString(),
      retry_count: 0,
    })
    .select()
    .single()

  if (subError || !subscription) {
    console.error('Subscription error:', subError)
    return null
  }
  return subscription
}

type PagarmeCard = {
  number: string
  holder_name: string
  exp_month: number
  exp_year: number
  cvv: string
  billing_address: {
    zip_code: string
    city: string
    state: string
    country: string
    line_1: string
  }
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
  admin: AdminClient
  subscriptionId: string
  planType: PlanType
  serverTotal: number
  paymentMethod: 'credit_card' | 'pix'
  installments: number
  customer: Record<string, unknown>
  metadata: Record<string, unknown>
  card: PagarmeCard | null
  pagarmeHeaders: Record<string, string>
}): Promise<ChargeAttemptResult> {
  let payments: Array<Record<string, unknown>>
  if (opts.paymentMethod === 'pix') {
    payments = [{ payment_method: 'pix' as const, pix: { expires_in: 3600 } }]
  } else {
    if (!opts.card) {
      // O caller (route handler) já valida isso antes de chamar esta função
      // (payment_method === 'credit_card' exige data.card), mas checamos de
      // novo aqui pra nunca mandar um card nulo pro Pagarme silenciosamente.
      throw new Error(
        'chargeOneTimeOrder: card é obrigatório quando paymentMethod é credit_card',
      )
    }
    payments = [
      {
        payment_method: 'credit_card' as const,
        credit_card: {
          recurrence: false,
          installments: opts.installments,
          statement_descriptor: 'DESAF DIABETS',
          card: opts.card,
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
  const payment = await insertPaymentWithRetry(opts.admin, {
    subscription_id: opts.subscriptionId,
    amount: opts.serverTotal,
    status: charge?.status === 'paid' ? 'paid' : 'pending',
    pagarme_charge_id: charge?.id ?? pagarmeData.id,
    paid_at: charge?.status === 'paid' ? new Date().toISOString() : null,
    webhook_payload: summarizePagarmePayload(pagarmeData),
  })

  await opts.admin.from('webhook_logs').insert({
    source: 'pagarme',
    event_type: 'order.created',
    payload: summarizePagarmePayload(pagarmeData),
    processed: true,
  })

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

async function deleteFailedSubscription(
  admin: AdminClient,
  subscriptionId: string,
) {
  await admin
    .from('terms_acceptances')
    .update({ subscription_id: null })
    .eq('subscription_id', subscriptionId)
  await admin.from('payments').delete().eq('subscription_id', subscriptionId)
  await admin.from('subscriptions').delete().eq('id', subscriptionId)
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

    if (data.payment_method === 'pix' && planType !== '1mes') {
      return NextResponse.json(
        { error: 'Pix disponível apenas no plano de 1 mês' },
        { status: 400 },
      )
    }

    if (data.payment_method === 'credit_card' && !data.card) {
      return NextResponse.json(
        { error: 'Dados do cartão são obrigatórios' },
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

    const admin = createAdminClient()

    const { data: profile } = await admin
      .from('users')
      .select('full_name, email, client_code')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'Perfil não encontrado' },
        { status: 404 },
      )
    }

    await admin.from('addresses').upsert(
      {
        user_id: user.id,
        zip_code: data.address.zip_code,
        street: data.address.street,
        number: data.address.number,
        complement: data.address.complement ?? '',
        neighborhood: data.address.neighborhood,
        city: data.address.city,
        state: data.address.state,
        is_default: true,
      },
      { onConflict: 'user_id' },
    )

    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || null

    const expYear = data.card
      ? data.card.exp_year.length === 2
        ? 2000 + parseInt(data.card.exp_year, 10)
        : parseInt(data.card.exp_year, 10)
      : 0

    const pagarmeAuth = `Basic ${Buffer.from(`${process.env.PAGARME_API_KEY}:`).toString('base64')}`
    const pagarmeHeaders = {
      'Content-Type': 'application/json',
      Authorization: pagarmeAuth,
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

    const card: PagarmeCard | null = data.card
      ? {
          number: data.card.number.replace(/\s/g, ''),
          holder_name: data.card.holder_name,
          exp_month: parseInt(data.card.exp_month, 10),
          exp_year: expYear,
          cvv: data.card.cvv,
          billing_address: {
            zip_code: data.address.zip_code,
            city: data.address.city,
            state: data.address.state,
            country: 'BR',
            line_1: `${data.address.number}, ${data.address.street}, ${data.address.neighborhood}`,
          },
        }
      : null

    const priced = await computeServerCheckoutTotal(admin, {
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

    const subscription = await createSubscriptionRow(admin, {
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

    await recordTermsAcceptance(admin, {
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

    const installments =
      planType === '6meses' ? 6 : planType === '3meses' ? 3 : 1

    const result = await chargeOneTimeOrder({
      admin,
      subscriptionId: subscription.id,
      planType,
      serverTotal,
      paymentMethod: data.payment_method,
      installments,
      customer,
      metadata,
      card,
      pagarmeHeaders,
    })

    if (!result.ok) {
      await deleteFailedSubscription(admin, subscription.id)
      return NextResponse.json(
        { error: result.error ?? 'Erro no pagamento' },
        { status: 400 },
      )
    }

    // Cartão recusado / não pago: não deixar subscription pending acumulando.
    // Pix fica pending de propósito até o pagamento confirmar.
    if (!result.paid && data.payment_method === 'credit_card') {
      await deleteFailedSubscription(admin, subscription.id)
      return NextResponse.json(
        { error: 'Pagamento não autorizado. Tente outro cartão.' },
        { status: 400 },
      )
    }

    let protocolId: string | null = null
    if (result.paid) {
      protocolId = await finalizePaidSubscription(admin, {
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

    return NextResponse.json({
      ok: true,
      order_id: result.pagarmeId,
      status: result.chargeStatus ?? 'pending',
      subscription_id: subscription.id,
      protocol_id: protocolId,
      results: {
        oneTime: {
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
