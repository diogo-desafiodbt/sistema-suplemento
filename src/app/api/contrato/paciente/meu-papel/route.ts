import { NextResponse } from 'next/server'
import { requirePacienteSession } from '@/app/api/contrato/paciente/_session'
import { getSql } from '@/lib/db'

export async function POST() {
  const session = await requirePacienteSession()
  if ('response' in session) return session.response

  try {
    const sql = getSql()
    const rows = await sql<
      {
        role: string
        full_name: string | null
        client_code: string | null
      }[]
    >`
      SELECT role, full_name, client_code
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
      role: profile.role,
      full_name: profile.full_name,
      client_code: profile.client_code,
    })
  } catch (error) {
    console.error('contrato/paciente/meu-papel:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
