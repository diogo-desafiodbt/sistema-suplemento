import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import { createShippingLabelForOrder } from '@/lib/shipping/create-label'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const profile = await getUserProfile(user.id)
  if (profile?.role !== 'admin') return null
  return true
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ok = await requireAdmin()
    if (!ok) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await context.params
    const sql = getSql()
    const orderRows = await sql<
      { id: string; status: string; shipping_request_id: string | null }[]
    >`
      SELECT id, status, shipping_request_id FROM orders
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    const order = orderRows[0] ?? null

    if (!order) {
      return NextResponse.json(
        { error: 'Pedido não encontrado' },
        { status: 404 },
      )
    }

    if (order.shipping_request_id) {
      return NextResponse.json({
        ok: true,
        id_requisicao: order.shipping_request_id,
        already: true,
      })
    }

    const result = await createShippingLabelForOrder(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('gerar-etiqueta error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
