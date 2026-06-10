import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function cancelPagarmeSubscription(pagarmeSubId: string): Promise<void> {
  const apiKey = process.env.PAGARME_API_KEY
  if (!apiKey) throw new Error('PAGARME_API_KEY ausente')

  const pagarmeAuth = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  const res = await fetch(
    `https://api.pagar.me/core/v5/subscriptions/${pagarmeSubId}`,
    {
      method: 'DELETE',
      headers: { Authorization: pagarmeAuth },
    }
  )

  if (res.ok || res.status === 404) return

  const body = await res.text()
  const alreadyCanceled =
    res.status === 422 ||
    body.toLowerCase().includes('cancel') ||
    body.toLowerCase().includes('not found')

  if (alreadyCanceled) return

  throw new Error(`Erro ao cancelar no Pagar.me: ${res.status} ${body}`)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: subscription } = await admin
      .from('subscriptions')
      .select('id, status, expires_at, pagarme_sub_id')
      .eq('user_id', user.id)
      .in('status', ['active', 'past_due', 'grace_period'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!subscription) {
      return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada' }, { status: 404 })
    }

    if (subscription.pagarme_sub_id) {
      await cancelPagarmeSubscription(subscription.pagarme_sub_id)
    }

    await admin
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('id', subscription.id)

    return NextResponse.json({ ok: true, expires_at: subscription.expires_at })
  } catch (error) {
    console.error('Cancelar assinatura error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
