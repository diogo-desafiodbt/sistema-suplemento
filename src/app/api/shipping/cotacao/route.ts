import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSql } from '@/lib/db'
import { getCotacao } from '@/lib/shipping/envie-agora/cotacao'
import {
  computePackageDimensions,
  type PackageItem,
} from '@/lib/shipping/package'
import { escolherTiers } from '@/lib/shipping/tiers'
import { sessaoAtual } from '@/lib/auth/sessao'
import type { ShippingOptionPublic } from '@/types/shipping'

const bodySchema = z.object({
  cepdestino: z.string().min(8),
  uf: z.string().length(2),
  valordeclarado: z.number().nonnegative(),
  protocol_items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(20).default(1),
      }),
    )
    .min(1),
})

export async function POST(request: NextRequest) {
  try {
    const sessao = await sessaoAtual()
    if (!sessao) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { options: [], erro: true, details: parsed.error.flatten() },
        { status: 200 },
      )
    }

    const { cepdestino, uf, valordeclarado, protocol_items } = parsed.data
    const sql = getSql()
    const productIds = protocol_items.map((i) => i.product_id)

    const products = await sql<{ id: string; box_type: string | null }[]>`
      SELECT id, box_type FROM products
      WHERE id = ANY(${sql.array(productIds)}::uuid[])
    `

    const byId = new Map(
      products.map((p) => [p.id, p.box_type as string | null]),
    )

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

    // Só os três níveis, e sem identificar a transportadora: o cliente escolhe
    // por prazo e preço. O serviço concreto é redescoberto no servidor na hora
    // de fechar o pedido, recotando e reaplicando esta mesma função.
    const options: ShippingOptionPublic[] = escolherTiers(quotes).map(
      ({ tier, quote }) => ({
        tier,
        valor: quote.valor,
        prazoDias: quote.prazoDias,
      }),
    )

    return NextResponse.json({ options, erro: false })
  } catch (error) {
    console.error('shipping/cotacao error:', error)
    return NextResponse.json({ options: [], erro: true })
  }
}
