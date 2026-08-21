import { NextResponse } from 'next/server'
import {
  isoDate,
  requirePacienteSession,
} from '@/app/api/contrato/paciente/_session'
import { asNumber, getSql } from '@/lib/db'

export async function POST() {
  const session = await requirePacienteSession()
  if ('response' in session) return session.response

  try {
    const sql = getSql()
    const rows = await sql<
      {
        id: string
        amount: string | number | null
        status: string
        paid_at: string | Date | null
      }[]
    >`
      SELECT p.id, p.amount, p.status, p.paid_at
      FROM payments p
      JOIN subscriptions s ON s.id = p.subscription_id
      WHERE s.user_id = ${session.userId}::uuid
      ORDER BY p.paid_at DESC NULLS LAST
      LIMIT 5
    `

    return NextResponse.json({
      payments: rows.map((p) => ({
        id: p.id,
        amount: p.amount == null ? null : asNumber(p.amount),
        status: p.status,
        paid_at: isoDate(p.paid_at),
      })),
    })
  } catch (error) {
    console.error('contrato/paciente/meus-pagamentos:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
