import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import {
  isoDateOnly,
  requirePacienteSession,
} from '@/app/api/contrato/paciente/_session'

export async function POST() {
  const session = await requirePacienteSession()
  if ('response' in session) return session.response

  try {
    const sql = getSql()
    const rows = await sql<
      {
        full_name: string | null
        email: string | null
        phone: string | null
        cpf: string | null
        birth_date: string | Date | null
      }[]
    >`
      SELECT full_name, email, phone, cpf, birth_date
      FROM users
      WHERE id = ${session.userId}::uuid
      LIMIT 1
    `
    const profile = rows[0]
    if (!profile) {
      return NextResponse.json(
        { error: 'Perfil não encontrado' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      cpf: profile.cpf,
      birth_date: isoDateOnly(profile.birth_date),
    })
  } catch (error) {
    console.error('contrato/paciente/meu-perfil:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
