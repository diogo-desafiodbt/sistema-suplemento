import { NextResponse } from 'next/server'
import {
  isoDate,
  requirePacienteSession,
} from '@/app/api/contrato/paciente/_session'
import { getSql } from '@/lib/db'

export async function POST() {
  const session = await requirePacienteSession()
  if ('response' in session) return session.response

  try {
    const sql = getSql()
    const rows = await sql<
      {
        id: string
        plan_type: string
        status: string
        expires_at: string | Date | null
        grace_period_ends_at: string | Date | null
        pagarme_sub_id: string | null
      }[]
    >`
      SELECT id, plan_type, status, expires_at, grace_period_ends_at, pagarme_sub_id
      FROM subscriptions
      WHERE user_id = ${session.userId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `
    const sub = rows[0]
    if (!sub) {
      return NextResponse.json({ subscription: null })
    }

    return NextResponse.json({
      id: sub.id,
      plan_type: sub.plan_type,
      status: sub.status,
      expires_at: isoDate(sub.expires_at),
      grace_period_ends_at: isoDate(sub.grace_period_ends_at),
      pagarme_sub_id: sub.pagarme_sub_id,
    })
  } catch (error) {
    console.error('contrato/paciente/minha-assinatura:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
