import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  full_name: z.string().min(1),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
  address: z.object({
    zip_code: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string().optional(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string().max(2),
  }),
})

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { full_name, phone, birth_date, address } = parsed.data
    const sql = getSql()

    try {
      await sql`
        UPDATE users
        SET
          full_name = ${full_name},
          phone = ${phone ?? null},
          birth_date = ${birth_date ?? null}
        WHERE id = ${user.id}::uuid
      `
    } catch (userError) {
      console.error('Erro ao atualizar usuário:', userError)
      return NextResponse.json(
        { error: 'Erro ao salvar dados pessoais' },
        { status: 500 },
      )
    }

    const existingAddress = await sql<{ id: string }[]>`
      SELECT id FROM addresses
      WHERE user_id = ${user.id}::uuid AND is_default = true
      LIMIT 1
    `

    try {
      if (existingAddress[0]) {
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
          WHERE id = ${existingAddress[0].id}::uuid
            AND user_id = ${user.id}::uuid
        `
      } else {
        await sql`
          INSERT INTO addresses (
            user_id, zip_code, street, number, complement,
            neighborhood, city, state, is_default
          )
          VALUES (
            ${user.id}::uuid,
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
    } catch (addrError) {
      console.error('Erro ao salvar endereço:', addrError)
      return NextResponse.json(
        { error: 'Erro ao salvar endereço' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Perfil atualizar error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
