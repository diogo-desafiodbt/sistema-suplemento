import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRastreamento } from '@/lib/shipping/envie-agora/rastreamento'
import { mergeTrackingEvents } from '@/lib/shipping/create-label'
import {
  getNewTrackingEvents,
  notifyNewTrackingEvents,
} from '@/lib/shipping/notify'

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
      .select('id, shipping_request_id, shipping_json')
      .eq('id', id)
      .single()

    if (!order?.shipping_request_id) {
      return NextResponse.json(
        { error: 'Pedido sem shipping_request_id' },
        { status: 400 }
      )
    }

    const tracking = await getRastreamento(order.shipping_request_id)
    const eventos = tracking.eventos ?? []

    // Persiste antes de notificar (mesmo padrão do webhook de rastreamento).
    const merged = mergeTrackingEvents(
      order.shipping_json,
      eventos as unknown as Array<Record<string, unknown>>
    )

    const updates: Record<string, unknown> = { shipping_json: merged }
    if (eventos.some(e => e.finalizado === 1)) {
      updates.status = 'delivered'
    }

    const { error: updateError } = await admin
      .from('orders')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      throw new Error(
        `atualizar-rastreio: falha ao persistir shipping_json: ${updateError.message}`
      )
    }

    const newEvents = getNewTrackingEvents(order.shipping_json, eventos)
    await notifyNewTrackingEvents(
      admin,
      order.id,
      newEvents.length > 0 ? newEvents : eventos
    )

    return NextResponse.json({ ok: true, eventos: eventos.length })
  } catch (error) {
    console.error('atualizar-rastreio error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
