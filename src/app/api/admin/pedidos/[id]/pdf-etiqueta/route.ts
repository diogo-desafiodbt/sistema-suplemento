import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPdfEtiqueta } from '@/lib/shipping/envie-agora/etiqueta'

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
      .select('id, shipping_request_id')
      .eq('id', id)
      .single()

    if (!order?.shipping_request_id) {
      return NextResponse.json(
        { error: 'Pedido sem shipping_request_id' },
        { status: 400 }
      )
    }

    const pdf = await getPdfEtiqueta(order.shipping_request_id)
    if (!pdf?.url) {
      return NextResponse.json(
        { error: 'PDF ainda não disponível (pode exigir autorização especial da Envie Agora)' },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, url: pdf.url })
  } catch (error) {
    console.error('pdf-etiqueta error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao obter PDF (verifique autorização especial na Envie Agora)',
      },
      { status: 500 }
    )
  }
}
