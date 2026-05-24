import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const checkoutSchema = z.object({
  protocol_id: z.string().uuid(),
  plan_type: z.enum(['1mes', '3meses', '1ano']),
  total_amount: z.number().positive(),
  address: z.object({
    zip_code: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string().optional(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string().length(2),
  }),
  card: z.object({
    number: z.string(),
    holder_name: z.string(),
    exp_month: z.string(),
    exp_year: z.string(),
    cvv: z.string(),
  }),
  cpf: z.string(),
})

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

    const expiresAt = new Date()
    if (data.plan_type === '1mes') expiresAt.setMonth(expiresAt.getMonth() + 1)
    else if (data.plan_type === '3meses') expiresAt.setMonth(expiresAt.getMonth() + 3)
    else expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    const { data: subscription, error: subError } = await admin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        protocol_id: data.protocol_id,
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

    const expYear = data.card.exp_year.length === 2
      ? 2000 + parseInt(data.card.exp_year, 10)
      : parseInt(data.card.exp_year, 10)

    const pagarmePayload = {
      items: [
        {
          amount: Math.round(data.total_amount * 100),
          description: `Desafio Diabetes — Plano ${data.plan_type}`,
          quantity: 1,
          code: `DD-${data.plan_type.toUpperCase()}`,
        },
      ],
      customer: {
        name: profile.full_name,
        email: profile.email,
        type: 'individual',
        document: data.cpf.replace(/\D/g, ''),
        document_type: 'CPF',
        phones: {
          mobile_phone: {
            country_code: '55',
            area_code: '11',
            number: '999999999',
          },
        },
      },
      payments: [
        {
          payment_method: 'credit_card',
          credit_card: {
            recurrence: false,
            installments: 1,
            statement_descriptor: 'DESAF DIABETS',
            card: {
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
            },
          },
        },
      ],
      metadata: {
        subscription_id: subscription.id,
        user_id: user.id,
        protocol_id: data.protocol_id,
        plan_type: data.plan_type,
        client_code: profile.client_code,
      },
    }

    const pagarmeRes = await fetch('https://api.pagar.me/core/v5/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(process.env.PAGARME_API_KEY + ':').toString('base64')}`,
      },
      body: JSON.stringify(pagarmePayload),
    })

    const pagarmeData = await pagarmeRes.json()
    console.log('PAGARME STATUS:', pagarmeRes.status)
    console.log('PAGARME RESPONSE:', JSON.stringify(pagarmeData, null, 2))
    console.log('CHARGE:', JSON.stringify(pagarmeData.charges?.[0], null, 2))

    if (!pagarmeRes.ok) {
      console.error('Pagar.me error:', pagarmeData)
      await admin.from('subscriptions').delete().eq('id', subscription.id)
      return NextResponse.json(
        { error: pagarmeData.message ?? 'Erro no pagamento' },
        { status: 400 }
      )
    }

    const charge = pagarmeData.charges?.[0]
    await admin.from('payments').insert({
      subscription_id: subscription.id,
      amount: data.total_amount,
      status: charge?.status === 'paid' ? 'paid' : 'pending',
      pagarme_charge_id: charge?.id ?? pagarmeData.id,
      paid_at: charge?.status === 'paid' ? new Date().toISOString() : null,
      webhook_payload: pagarmeData,
    })

    if (charge?.status === 'paid') {
      await admin.from('user_entitlements').insert({
        user_id: user.id,
        product_key: 'treatment',
        status: 'active',
        expires_at: expiresAt.toISOString(),
        is_permanent: false,
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
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
