import { NextResponse } from 'next/server'
import { requirePacienteSession } from '@/app/api/contrato/paciente/_session'
import { getSql } from '@/lib/db'
import { canCancelRecurringBilling } from '@/lib/plans'

async function cancelPagarmeSubscription(pagarmeSubId: string): Promise<void> {
  const apiKey = process.env.PAGARME_API_KEY
  if (!apiKey) throw new Error('PAGARME_API_KEY ausente')

  const pagarmeAuth = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  const res = await fetch(
    `https://api.pagar.me/core/v5/subscriptions/${pagarmeSubId}`,
    {
      method: 'DELETE',
      headers: { Authorization: pagarmeAuth },
    },
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

export async function POST() {
  const session = await requirePacienteSession()
  if ('response' in session) return session.response

  try {
    const sql = getSql()
    const subscriptionRows = await sql<
      {
        id: string
        status: string
        expires_at: string | Date | null
        pagarme_sub_id: string | null
        plan_type: string | null
      }[]
    >`
      SELECT id, status, expires_at, pagarme_sub_id, plan_type
      FROM subscriptions
      WHERE user_id = ${session.userId}::uuid
        AND status = ANY(${sql.array(['active', 'past_due', 'grace_period'])}::subscription_status[])
      ORDER BY created_at DESC
      LIMIT 1
    `
    const subscription = subscriptionRows[0] ?? null

    if (!subscription) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura ativa encontrada' },
        { status: 404 },
      )
    }

    if (
      !canCancelRecurringBilling(
        subscription.plan_type ?? '',
        subscription.pagarme_sub_id,
      )
    ) {
      return NextResponse.json(
        {
          error: 'Este plano foi pago integralmente e não pode ser cancelado.',
        },
        { status: 400 },
      )
    }

    if (subscription.pagarme_sub_id) {
      await cancelPagarmeSubscription(subscription.pagarme_sub_id)
    }

    await sql`
      UPDATE subscriptions
      SET status = 'canceled'
      WHERE id = ${subscription.id}::uuid
        AND user_id = ${session.userId}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('contrato/paciente/cancelar-assinatura:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
