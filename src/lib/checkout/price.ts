import { asNumber, getSql } from '@/lib/db'
import {
  getPharmacyCycleMultiplier,
  getUnitPriceFromProduct,
  roundMoney,
} from '@/lib/plans'
import { getCotacao } from '@/lib/shipping/envie-agora/cotacao'
import {
  computePackageDimensions,
  type PackageItem,
} from '@/lib/shipping/package'
import { escolherTiers } from '@/lib/shipping/tiers'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { ShippingSelection, ShippingTier } from '@/types/shipping'

type AdminClient = ReturnType<typeof createAdminClient>

type ProtocolItemInput = {
  product_id?: string
  removed?: boolean
  blocked?: boolean
  quantity?: number
}

export type PricedCheckout = {
  serverTotal: number
  productsSubtotal: number
  shipping: ShippingSelection
}

/**
 * Recalcula total a partir do DB + cotação fresca.
 * Não confia em total_amount / shipping.valor / price_* do cliente.
 *
 * O cliente informa apenas o nível de frete que escolheu — preço, prazo e
 * transportadora saem daqui, da cotação fresca. Não há nada vindo do navegador
 * que possa baratear o pedido.
 *
 * `includeShipping: false` → shipping.valor = 0 (subtotal só de produtos).
 */
export async function computeServerCheckoutTotal(
  admin: AdminClient,
  params: {
    planType: string
    protocolItems: ProtocolItemInput[]
    shipping: { tier: ShippingTier }
    address: { zip_code: string; state: string }
    includeShipping?: boolean
  },
): Promise<
  { ok: true; priced: PricedCheckout } | { ok: false; error: string }
> {
  const includeShipping = params.includeShipping !== false
  const activeItems = params.protocolItems.filter(
    (i) => !i.removed && !i.blocked,
  )
  if (activeItems.length === 0) {
    return { ok: false, error: 'Nenhum item ativo no protocolo' }
  }

  const missingId = activeItems.find((i) => !i.product_id)
  if (missingId) {
    return { ok: false, error: 'Item do protocolo sem product_id' }
  }

  const productIds = activeItems.map((i) => i.product_id as string)
  const sql = getSql()
  let products: Array<{
    id: string
    price_monthly: string | number | null
    price_quarterly: string | number | null
    price_yearly: string | number | null
    box_type: string | null
    is_active: boolean
  }>
  try {
    products = await sql`
      SELECT id, price_monthly, price_quarterly, price_yearly, box_type, is_active
      FROM products
      WHERE id = ANY(${sql.array(productIds)}::uuid[])
    `
  } catch {
    return { ok: false, error: 'Erro ao carregar produtos' }
  }

  const byId = new Map(
    products.map((p) => [
      p.id,
      {
        ...p,
        price_monthly:
          p.price_monthly == null ? null : asNumber(p.price_monthly),
        price_quarterly:
          p.price_quarterly == null ? null : asNumber(p.price_quarterly),
        price_yearly: p.price_yearly == null ? null : asNumber(p.price_yearly),
      },
    ]),
  )
  let productsSubtotal = 0
  const packageItems: PackageItem[] = []
  // Peso/volume físico: 3meses/6meses despacham N× o pacote mensal.
  // TODO(Miligrama): validar multiplicador operacional.
  const cycleMult = getPharmacyCycleMultiplier(params.planType)

  for (const item of activeItems) {
    const product = byId.get(item.product_id as string)
    if (!product || product.is_active === false) {
      return { ok: false, error: 'Produto inválido ou inativo no protocolo' }
    }
    const qtyRaw = item.quantity
    if (
      qtyRaw != null &&
      (!Number.isInteger(qtyRaw) || qtyRaw < 1 || qtyRaw > 20)
    ) {
      return { ok: false, error: 'Quantidade de item inválida' }
    }
    const qty = qtyRaw ?? 1
    productsSubtotal += getUnitPriceFromProduct(product, params.planType) * qty
    if (product.box_type === 'R80' || product.box_type === 'R110') {
      packageItems.push({
        box_type: product.box_type,
        quantity: qty * cycleMult,
      })
    }
  }

  productsSubtotal = roundMoney(productsSubtotal)

  if (!includeShipping) {
    return {
      ok: true,
      priced: {
        serverTotal: productsSubtotal,
        productsSubtotal,
        shipping: {
          tier: params.shipping.tier,
          valor: 0,
          prazoDias: 0,
          codigoServico: '',
        },
      },
    }
  }

  const dimensions = await computePackageDimensions(packageItems)
  const quotes = await getCotacao({
    cepdestino: params.address.zip_code,
    destinoUf: params.address.state,
    valordeclarado: productsSubtotal,
    dimensions,
  })

  if (!quotes.length) {
    return { ok: false, error: 'Não foi possível cotar o frete' }
  }

  // O cliente escolheu um nível ("mais rápido"), não um serviço — ele nem sabe
  // qual transportadora existe do outro lado. Recotamos e reaplicamos a mesma
  // regra de níveis para descobrir qual serviço contratar agora.
  //
  // Efeito colateral desejado: se a cotação mudou desde que a tela carregou, o
  // nível continua valendo e o preço vem do servidor. O guard de total no
  // /api/checkout/create é quem avisa o cliente quando o valor mudou.
  const match = escolherTiers(quotes).find(
    (t) => t.tier === params.shipping.tier,
  )?.quote

  if (!match) {
    return { ok: false, error: 'Opção de frete inválida ou expirada' }
  }

  const shipping: ShippingSelection = {
    tier: params.shipping.tier,
    valor: match.valor,
    prazoDias: match.prazoDias,
    codigoServico: match.codigoServico,
    transportadora: match.transportadora,
    nomeServico: match.nomeServico,
  }

  const serverTotal = roundMoney(productsSubtotal + shipping.valor)
  return { ok: true, priced: { serverTotal, productsSubtotal, shipping } }
}
