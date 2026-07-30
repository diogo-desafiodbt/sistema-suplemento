import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createShippingLabelForOrder } from '@/lib/shipping/create-label'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return null
  return admin
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await context.params
    const { data: order } = await admin
      .from('orders')
      .select('id, status, shipping_request_id')
      .eq('id', id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
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
      { status: 500 }
    )
  }
}
