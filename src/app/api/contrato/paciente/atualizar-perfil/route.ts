import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePacienteSession } from '@/app/api/contrato/paciente/_session'
import { getSql } from '@/lib/db'

/**
 * Campo em branco no formulário chega como `''`, não como ausente — e `''`
 * passa por `z.string()`. Sem esta normalização, `birth_date = ''` ia para uma
 * coluna `date` e o driver estourava `RangeError: Invalid time value` antes
 * mesmo de falar com o banco: o perfil inteiro deixava de salvar por causa de
 * um campo que a pessoa nem preencheu.
 */
const vazioVirauNulo = (v: string | undefined) => {
  const t = v?.trim()
  return t ? t : null
}

const bodySchema = z.object({
  full_name: z.string().trim().min(1),
  phone: z.string().optional(),
  // aaaa-mm-dd, que é o que o <input type="date"> manda. Em branco vira nulo.
  birth_date: z
    .string()
    .optional()
    .refine((v) => !v?.trim() || /^\d{4}-\d{2}-\d{2}$/.test(v.trim()), {
      message: 'Data de nascimento inválida',
    }),
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
        phone = ${vazioVirauNulo(phone)},
        birth_date = ${vazioVirauNulo(birth_date)}
      WHERE id = ${session.userId}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('contrato/paciente/atualizar-perfil:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
