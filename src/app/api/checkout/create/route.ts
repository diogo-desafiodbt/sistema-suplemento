import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { ensureProtocolAfterPayment } from '@/lib/protocol/create-from-checkout'
import type { PendingCheckoutPayload } from '@/lib/protocol/create-from-checkout'
import { addPlanPeriod, isRecurringPlan } from '@/lib/plans'

const protocolItemSchema = z.object({
  product_id: z.string().uuid().optional(),
  product_name: z.string(),
  is_required: z.boolean().optional(),
  removed: z.boolean().optional(),
  activation_reason: z.string().optional(),
  quantity: z.number().optional(),
  price_monthly: z.number().optional(),
  price_quarterly: z.number().optional(),
  price_yearly: z.number().optional(),
  image: z.string().optional(),
})

const checkoutSchema = z.object({
  // Novos: 1mes | assinatura_mensal. Legado aceito só por compatibilidade de payload.
  plan_type: z.enum(['1mes', 'assinatura_mensal', '3meses', '1ano']),
  total_amount: z.number().positive(),
  source: z.enum(['full_quiz', 'mini_quiz']),
  quiz: z.object({
    diagnosis_type: z.enum(['type2', 'prediabetes', 'undiagnosed']),
    years_diagnosed: z.string().optional(),
    hba1c_range: z.string().nullable().optional(),
    fasting_glucose: z.string().nullable().optional(),
    medications: z.array(z.string()).optional(),
    family_history: z.array(z.string()).optional(),
    symptoms: z.array(z.string()).optional(),
    conditions_mild: z.array(z.string()).optional(),
    conditions_serious: z.array(z.string()).optional(),
    weight_status: z.string().nullable().optional(),
    exercise_freq: z.string().nullable().optional(),
    diet_quality: z.string().nullable().optional(),
    allergies: z.string().nullable().optional(),
    prior_treatment: z.array(z.string()).optional(),
    age: z.number().int().positive().optional(),
    full_name: z.string().optional(),
  }),
  protocol_items: z.array(protocolItemSchema).min(1),
  shipping: z.object({
    tipo: z.enum(['economica', 'expressa', 'padrao']),
    valor: z.number().nonnegative(),
    prazoDias: z.number().nonnegative(),
    codigoServico: z.string(),
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

async function finalizePaidSubscription(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    subscriptionId: string
    userId: string
    expiresAt: Date
  }
) {
  const protocolId = await ensureProtocolAfterPayment(
    admin,
    opts.subscriptionId,
    opts.userId
  )

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

  return protocolId
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = checkoutSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data

    if (data.payment_method === 'credit_card' && !data.card) {
      return NextResponse.json(
        { error: 'Dados do cartão são obrigatórios' },
        { status: 400 }
      )
    }

    if (data.payment_method === 'pix' && isRecurringPlan(data.plan_type)) {
      return NextResponse.json(
        { error: 'Pix disponível apenas para compra única' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    const { data: profile } = await admin
      .from('users')
      .select('full_name, email, client_code')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
    }

    await admin.from('addresses').upsert({
      user_id: user.id,
      zip_code: data.address.zip_code,
      street: data.address.street,
      number: data.address.number,
      complement: data.address.complement ?? '',
      neighborhood: data.address.neighborhood,
      city: data.address.city,
      state: data.address.state,
      is_default: true,
    }, { onConflict: 'user_id' })

    // Model A: expires_at = fim do período pago; next_billing_at alinhado.
    const expiresAt = addPlanPeriod(new Date(), data.plan_type)

    const pendingCheckout: PendingCheckoutPayload = {
      source: data.source,
      plan_type: data.plan_type,
      shipping: data.shipping,
      quiz: data.quiz,
      protocol_items: data.protocol_items,
    }

    const { data: subscription, error: subError } = await admin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        protocol_id: null,
        pending_checkout: pendingCheckout,
        plan_type: data.plan_type,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        next_billing_at: expiresAt.toISOString(),
        retry_count: 0,
      })
      .select()
      .single()

    if (subError) {
      console.error('Subscription error:', subError)
      return NextResponse.json({ error: 'Erro ao criar assinatura' }, { status: 500 })
    }

    const expYear = data.card
      ? data.card.exp_year.length === 2
        ? 2000 + parseInt(data.card.exp_year, 10)
        : parseInt(data.card.exp_year, 10)
      : 0

    const pagarmeAuth = `Basic ${Buffer.from(process.env.PAGARME_API_KEY + ':').toString('base64')}`
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

    const metadata = {
      subscription_id: subscription.id,
      user_id: user.id,
      plan_type: data.plan_type,
      client_code: profile.client_code,
    }

    const card = data.card
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

    let pagarmeRes: Response

    if (!isRecurringPlan(data.plan_type)) {
      const payments =
        data.payment_method === 'pix'
          ? [{ payment_method: 'pix' as const, pix: { expires_in: 3600 } }]
          : [
              {
                payment_method: 'credit_card' as const,
                credit_card: {
                  recurrence: false,
                  installments: 1,
                  statement_descriptor: 'DESAF DIABETS',
                  card: card!,
                },
              },
            ]

      const pagarmePayload = {
        items: [
          {
            amount: Math.round(data.total_amount * 100),
            description: 'Desafio Diabetes — Compra única',
            quantity: 1,
            code: 'DD-1MES',
          },
        ],
        customer,
        payments,
        metadata,
      }

      pagarmeRes = await fetch('https://api.pagar.me/core/v5/orders', {
        method: 'POST',
        headers: pagarmeHeaders,
        body: JSON.stringify(pagarmePayload),
      })
    } else {
      if (!card) {
        return NextResponse.json(
          { error: 'Dados do cartão são obrigatórios' },
          { status: 400 }
        )
      }

      const intervalCount =
        data.plan_type === 'assinatura_mensal'
          ? 1
          : data.plan_type === '3meses'
            ? 3
            : 12

      const planItemName =
        data.plan_type === 'assinatura_mensal'
          ? 'Desafio Diabetes — Assinatura mensal'
          : data.plan_type === '3meses'
            ? 'Desafio Diabetes — Plano 3 meses'
            : 'Desafio Diabetes — Plano 1 ano'

      const pagarmeSubscriptionPayload = {
        payment_method: 'credit_card',
        currency: 'BRL',
        interval: 'month',
        interval_count: intervalCount,
        billing_type: 'prepaid',
        installments: 1,
        items: [
          {
            name: planItemName,
            quantity: 1,
            pricing_scheme: {
              scheme_type: 'unit',
              price: Math.round(data.total_amount * 100),
            },
          },
        ],
        customer,
        card,
        metadata,
      }

      pagarmeRes = await fetch('https://api.pagar.me/core/v5/subscriptions', {
        method: 'POST',
        headers: pagarmeHeaders,
        body: JSON.stringify(pagarmeSubscriptionPayload),
      })
    }

    const pagarmeData = await pagarmeRes.json()
    console.log('PAGARME STATUS:', pagarmeRes.status)
    console.log('PAGARME RESPONSE:', JSON.stringify(pagarmeData, null, 2))

    if (!pagarmeRes.ok) {
      console.error('Pagar.me error:', pagarmeData)
      await admin.from('subscriptions').delete().eq('id', subscription.id)
      return NextResponse.json(
        { error: pagarmeData.message ?? 'Erro no pagamento' },
        { status: 400 }
      )
    }

    if (!isRecurringPlan(data.plan_type)) {
      const charge = pagarmeData.charges?.[0]
      console.log('CHARGE:', JSON.stringify(charge, null, 2))

      await admin.from('payments').insert({
        subscription_id: subscription.id,
        amount: data.total_amount,
        status: charge?.status === 'paid' ? 'paid' : 'pending',
        pagarme_charge_id: charge?.id ?? pagarmeData.id,
        paid_at: charge?.status === 'paid' ? new Date().toISOString() : null,
        webhook_payload: pagarmeData,
      })

      let protocolId: string | null = null
      if (charge?.status === 'paid') {
        protocolId = await finalizePaidSubscription(admin, {
          subscriptionId: subscription.id,
          userId: user.id,
          expiresAt,
        })
      }

      await admin.from('webhook_logs').insert({
        source: 'pagarme',
        event_type: 'order.created',
        payload: pagarmeData,
        processed: true,
      })

      return NextResponse.json({
        ok: true,
        order_id: pagarmeData.id,
        status: charge?.status ?? 'pending',
        subscription_id: subscription.id,
        protocol_id: protocolId,
        ...(data.payment_method === 'pix'
          ? {
              pix: charge?.last_transaction
                ? {
                    qr_code: charge.last_transaction.qr_code,
                    qr_code_url: charge.last_transaction.qr_code_url,
                    expires_at: charge.last_transaction.expires_at,
                  }
                : null,
            }
          : {}),
      })
    }

    await admin
      .from('subscriptions')
      .update({ pagarme_sub_id: pagarmeData.id })
      .eq('id', subscription.id)

    const cycleStatus = pagarmeData.current_cycle?.status as string | undefined
    const cycleChargeId =
      (pagarmeData.current_cycle?.id as string | undefined) ?? pagarmeData.id

    console.log('CURRENT_CYCLE:', JSON.stringify(pagarmeData.current_cycle, null, 2))

    await admin.from('payments').insert({
      subscription_id: subscription.id,
      amount: data.total_amount,
      status: cycleStatus === 'paid' ? 'paid' : 'pending',
      pagarme_charge_id: cycleChargeId,
      paid_at: cycleStatus === 'paid' ? new Date().toISOString() : null,
      webhook_payload: pagarmeData,
    })

    let protocolId: string | null = null
    if (cycleStatus === 'paid') {
      protocolId = await finalizePaidSubscription(admin, {
        subscriptionId: subscription.id,
        userId: user.id,
        expiresAt,
      })
    }

    await admin.from('webhook_logs').insert({
      source: 'pagarme',
      event_type: 'subscription.created',
      payload: pagarmeData,
      processed: true,
    })

    return NextResponse.json({
      ok: true,
      order_id: pagarmeData.id,
      status: cycleStatus ?? 'pending',
      subscription_id: subscription.id,
      protocol_id: protocolId,
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
