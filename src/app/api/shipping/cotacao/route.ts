import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computePackageDimensions, type PackageItem } from '@/lib/shipping/package'
import { getCotacao } from '@/lib/shipping/envie-agora/cotacao'
import { shippingQuoteKey, type ShippingOptionPublic } from '@/types/shipping'

const bodySchema = z.object({
  cepdestino: z.string().min(8),
  uf: z.string().length(2),
  valordeclarado: z.number().nonnegative(),
  protocol_items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().positive().default(1),
      })
    )
    .min(1),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { options: [], erro: true, details: parsed.error.flatten() },
        { status: 200 }
      )
    }

    const { cepdestino, uf, valordeclarado, protocol_items } = parsed.data
    const admin = createAdminClient()
    const productIds = protocol_items.map(i => i.product_id)

    const { data: products } = await admin
      .from('products')
      .select('id, box_type')
      .in('id', productIds)

    const byId = new Map((products ?? []).map(p => [p.id, p.box_type as string | null]))

    const packageItems: PackageItem[] = []
    for (const item of protocol_items) {
      const box = byId.get(item.product_id)
      if (box === 'R80' || box === 'R110') {
        packageItems.push({ box_type: box, quantity: item.quantity })
      }
    }

    const dimensions = await computePackageDimensions(packageItems)
    const quotes = await getCotacao({
      cepdestino,
      destinoUf: uf,
      valordeclarado,
      dimensions,
    })

    if (quotes.length === 0) {
      return NextResponse.json({ options: [], erro: true })
    }

    const economica = quotes.reduce((a, b) => (a.valor <= b.valor ? a : b))
    const expressa = quotes.reduce((a, b) => {
      if (a.prazoDias < b.prazoDias) return a
      if (b.prazoDias < a.prazoDias) return b
      return a.valor <= b.valor ? a : b
    })

    // Todas as cotações da Envie Agora — transportadora/serviço visíveis pra validação.
    const sorted = [...quotes].sort((a, b) => {
      if (a.valor !== b.valor) return a.valor - b.valor
      return a.prazoDias - b.prazoDias
    })

    const economicaKey = shippingQuoteKey(economica)
    const expressaKey = shippingQuoteKey(expressa)

    const options: ShippingOptionPublic[] = sorted.map((q) => {
      const key = shippingQuoteKey(q)
      let tipo: ShippingOptionPublic['tipo'] = 'padrao'
      if (key === economicaKey) tipo = 'economica'
      else if (key === expressaKey) tipo = 'expressa'

      return {
        tipo,
        valor: q.valor,
        prazoDias: q.prazoDias,
        codigoServico: q.codigoServico,
        transportadora: q.transportadora,
        nomeServico: q.nomeServico,
      }
    })

    return NextResponse.json({ options, erro: false })
  } catch (error) {
    console.error('shipping/cotacao error:', error)
    return NextResponse.json({ options: [], erro: true })
  }
}
