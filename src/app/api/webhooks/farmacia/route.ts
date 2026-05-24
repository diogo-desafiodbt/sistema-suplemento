import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const admin = createAdminClient()

    const { data: webhookLog } = await admin.from('webhook_logs').insert({
      source: 'pharmacy',
      event_type: 'order.dispatched',
      payload,
      processed: false,
    }).select('id').single()

    const { NumeroObjeto, CodigoPedido } = payload

    if (!NumeroObjeto || !CodigoPedido) {
      return NextResponse.json({ ok: true })
    }

    await admin
      .from('orders')
      .update({
        tracking_code: NumeroObjeto,
        status: 'dispatched',
      })
      .eq('id', CodigoPedido)

    if (webhookLog?.id) {
      await admin
        .from('webhook_logs')
        .update({ processed: true })
        .eq('id', webhookLog.id)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Farmacia webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
