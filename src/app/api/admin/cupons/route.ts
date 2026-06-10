import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const admin = createAdminClient()
    const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const { code, type, value, expires_at, max_uses } = parsed.data

    if (type === 'percentage' && value > 100) {
      return NextResponse.json({ error: 'Percentual não pode ser maior que 100' }, { status: 400 })
    }

    const { data: coupon, error } = await admin
      .from('discount_coupons')
      .insert({
        code,
        type,
        value,
        expires_at: expires_at ?? null,
        max_uses: max_uses ?? null,
        used_count: 0,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Já existe um cupom com esse código.' }, { status: 409 })
      }
      console.error('Erro ao criar cupom:', error)
      return NextResponse.json({ error: 'Erro ao criar cupom' }, { status: 500 })
    }

    return NextResponse.json({ coupon })
  } catch (error) {
    console.error('Admin cupons POST error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
