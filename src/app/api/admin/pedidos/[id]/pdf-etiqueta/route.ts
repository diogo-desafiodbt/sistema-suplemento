import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import { getPdfEtiqueta } from '@/lib/shipping/envie-agora/etiqueta'
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
      { id: string; shipping_request_id: string | null }[]
    >`
      SELECT id, shipping_request_id FROM orders
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    const order = orderRows[0] ?? null

    if (!order?.shipping_request_id) {
      return NextResponse.json(
        { error: 'Pedido sem shipping_request_id' },
        { status: 400 },
      )
    }

    const pdf = await getPdfEtiqueta(order.shipping_request_id)
    if (!pdf?.url) {
      return NextResponse.json(
        {
          error:
            'PDF ainda não disponível (pode exigir autorização especial da Envie Agora)',
        },
        { status: 502 },
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
      { status: 500 },
    )
  }
}
