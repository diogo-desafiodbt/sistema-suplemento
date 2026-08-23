import { type NextRequest, NextResponse } from 'next/server'
import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const sessao = await sessaoAtual()

    if (!sessao) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const subscriptionId = request.nextUrl.searchParams.get('subscription_id')
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'subscription_id obrigatório' },
        { status: 400 },
      )
    }

    const sql = getSql()
    const subRows = await sql<{ id: string }[]>`
      SELECT id FROM subscriptions
      WHERE id = ${subscriptionId}::uuid AND user_id = ${sessao.userId}::uuid
      LIMIT 1
    `
    const subscription = subRows[0] ?? null

    if (!subscription) {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    }

    const paymentRows = await sql<{ status: string }[]>`
      SELECT status FROM payments
      WHERE subscription_id = ${subscriptionId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `
    const payment = paymentRows[0] ?? null

    const raw = payment?.status ?? 'pending'
    const status =
      raw === 'paid' || raw === 'failed' || raw === 'pending' ? raw : 'pending'

    return NextResponse.json({ status })
  } catch (error) {
    console.error('checkout/status error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
