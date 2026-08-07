import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFarmaciaAuthorized, parseDateRange } from '@/lib/pharmacy/pull-api'

type OrderRow = {
  id: string
  created_at: string
  status: string
  subscriptions: {
    protocols: { status: string } | null
  } | null
}

function isSignedProtocol(order: OrderRow): boolean {
  const protocol = order.subscriptions?.protocols
  return protocol?.status === 'signed'
}

export async function GET(request: NextRequest) {
  if (!isFarmaciaAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const range = parseDateRange(request.nextUrl.searchParams)
    if (range.invalid) {
      return NextResponse.json({ error: range.invalid }, { status: 400 })
    }

    const admin = createAdminClient()
    let query = admin
      .from('orders')
      .select(
        `
        id,
        created_at,
        status,
        subscriptions!inner (
          protocols!inner (
            status
          )
        )
      `
      )
      .eq('subscriptions.protocols.status', 'signed')
      .order('created_at', { ascending: true })

    if (range.gte) query = query.gte('created_at', range.gte)
    if (range.lt) query = query.lt('created_at', range.lt)

    const { data: orders, error } = await query
    if (error) {
      console.error('farmacia/pedidos error:', error)
      return NextResponse.json({ error: 'Erro ao buscar pedidos' }, { status: 500 })
    }

    // Defesa em profundidade: omitir não assinados (não é erro)
    const signed = ((orders ?? []) as unknown as OrderRow[]).filter(
      isSignedProtocol
    )

    const result = signed.map((o) => ({
      numero_pedido: o.id,
      data_compra: o.created_at,
      status: o.status,
    }))

    await admin.from('pharmacy_api_logs').insert({
      endpoint: 'listagem',
      query_params: range.params,
      order_ids_returned: result.map((r) => r.numero_pedido),
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('farmacia/pedidos error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
