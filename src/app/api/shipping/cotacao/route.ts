import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { computePackageDimensions, type PackageItem } from '@/lib/shipping/package'
import { getCotacao } from '@/lib/shipping/envie-agora/cotacao'
import type { ShippingOptionPublic } from '@/types/shipping'

const bodySchema = z.object({
  cepdestino: z.string().min(8),
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
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { options: [], erro: true, details: parsed.error.flatten() },
        { status: 200 }
      )
    }

    const { cepdestino, valordeclarado, protocol_items } = parsed.data
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

    const options: ShippingOptionPublic[] = []
    options.push({
      tipo: 'economica',
      valor: economica.valor,
      prazoDias: economica.prazoDias,
      codigoServico: economica.codigoServico,
    })

    if (economica.codigoServico !== expressa.codigoServico) {
      options.push({
        tipo: 'expressa',
        valor: expressa.valor,
        prazoDias: expressa.prazoDias,
        codigoServico: expressa.codigoServico,
      })
    }

    return NextResponse.json({ options, erro: false })
  } catch (error) {
    console.error('shipping/cotacao error:', error)
    return NextResponse.json({ options: [], erro: true })
  }
}
