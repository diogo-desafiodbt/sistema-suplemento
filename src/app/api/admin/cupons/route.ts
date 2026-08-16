import { type NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'
import { z } from 'zod'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

const createSchema = z.object({
  code: z.string().min(1).toUpperCase(),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().positive(),
  expires_at: z.string().nullable().optional(),
  max_uses: z.number().int().positive().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user)
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const profile = await getUserProfile(user.id)
    if (profile?.role !== 'admin')
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const { code, type, value, expires_at, max_uses } = parsed.data

    if (type === 'percentage' && value > 100) {
      return NextResponse.json(
        { error: 'Percentual não pode ser maior que 100' },
        { status: 400 },
      )
    }

    const sql = getSql()
    try {
      const couponRows = await sql`
        INSERT INTO discount_coupons (
          code, type, value, expires_at, max_uses, used_count, is_active
        )
        VALUES (
          ${code}, ${type}, ${value}, ${expires_at ?? null},
          ${max_uses ?? null}, 0, true
        )
        RETURNING *
      `
      const coupon = couponRows[0]
      return NextResponse.json({ coupon })
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.code === '23505') {
        return NextResponse.json(
          { error: 'Já existe um cupom com esse código.' },
          { status: 409 },
        )
      }
      console.error('Erro ao criar cupom:', error)
      return NextResponse.json(
        { error: 'Erro ao criar cupom' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Admin cupons POST error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
