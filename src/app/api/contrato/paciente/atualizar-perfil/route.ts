import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePacienteSession } from '@/app/api/contrato/paciente/_session'
import { getSql } from '@/lib/db'

const bodySchema = z.object({
  full_name: z.string().min(1),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
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

    const { full_name, phone, birth_date } = parsed.data
    const sql = getSql()

    await sql`
      UPDATE users
      SET
        full_name = ${full_name},
        phone = ${phone ?? null},
        birth_date = ${birth_date ?? null}
      WHERE id = ${session.userId}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('contrato/paciente/atualizar-perfil:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
