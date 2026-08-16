import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

const patchSchema = z.object({
  is_active: z.boolean(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

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
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const sql = getSql()
    try {
      await sql`
        UPDATE discount_coupons
        SET is_active = ${parsed.data.is_active}
        WHERE id = ${id}::uuid
      `
    } catch (error) {
      console.error('Erro ao atualizar cupom:', error)
      return NextResponse.json(
        { error: 'Erro ao atualizar cupom' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Admin cupons PATCH error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
