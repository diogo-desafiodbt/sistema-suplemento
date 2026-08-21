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
        zip_code: string
        street: string
        number: string
        complement: string | null
        neighborhood: string
        city: string
        state: string
      }[]
    >`
      SELECT zip_code, street, number, complement, neighborhood, city, state
      FROM addresses
      WHERE user_id = ${session.userId}::uuid AND is_default = true
      LIMIT 1
    `
    const address = rows[0]
    if (!address) {
      return NextResponse.json({ address: null })
    }

    return NextResponse.json({
      zip_code: address.zip_code,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
    })
  } catch (error) {
    console.error('contrato/paciente/meu-endereco:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
