import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePacienteSession } from '@/app/api/contrato/paciente/_session'
import { getSql } from '@/lib/db'

const bodySchema = z.object({
  zip_code: z.string().min(1),
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().max(2).min(2),
})

export async function POST(request: NextRequest) {
  const session = await requirePacienteSession()
  if ('response' in session) return session.response

  try {
    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const address = parsed.data
    const sql = getSql()

    const existing = await sql<{ id: string }[]>`
      SELECT id FROM addresses
      WHERE user_id = ${session.userId}::uuid AND is_default = true
      LIMIT 1
    `

    if (existing[0]) {
      await sql`
        UPDATE addresses
        SET
          zip_code = ${address.zip_code},
          street = ${address.street},
          number = ${address.number},
          complement = ${address.complement ?? null},
          neighborhood = ${address.neighborhood},
          city = ${address.city},
          state = ${address.state}
        WHERE id = ${existing[0].id}::uuid
          AND user_id = ${session.userId}::uuid
      `
    } else {
      await sql`
        INSERT INTO addresses (
          user_id, zip_code, street, number, complement,
          neighborhood, city, state, is_default
        )
        VALUES (
          ${session.userId}::uuid,
          ${address.zip_code},
          ${address.street},
          ${address.number},
          ${address.complement ?? null},
          ${address.neighborhood},
          ${address.city},
          ${address.state},
          true
        )
      `
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('contrato/paciente/salvar-endereco:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
