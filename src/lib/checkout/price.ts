import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPharmacyCycleMultiplier,
  getUnitPriceFromProduct,
  roundMoney,
} from '@/lib/plans'
import { computePackageDimensions, type PackageItem } from '@/lib/shipping/package'
import { getCotacao } from '@/lib/shipping/envie-agora/cotacao'
import type { ShippingSelection } from '@/types/shipping'

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
 * `includeShipping: false` → shipping.valor = 0 (subtotal só de produtos).
 */
export async function computeServerCheckoutTotal(
  admin: AdminClient,
  params: {
    planType: string
    protocolItems: ProtocolItemInput[]
    shipping: ShippingSelection
    address: { zip_code: string; state: string }
    includeShipping?: boolean
  }
): Promise<{ ok: true; priced: PricedCheckout } | { ok: false; error: string }> {
  const includeShipping = params.includeShipping !== false
  const activeItems = params.protocolItems.filter(
    (i) => !i.removed && !i.blocked
  )
  if (activeItems.length === 0) {
    return { ok: false, error: 'Nenhum item ativo no protocolo' }
  }

  const missingId = activeItems.find((i) => !i.product_id)
  if (missingId) {
    return { ok: false, error: 'Item do protocolo sem product_id' }
  }

  const productIds = activeItems.map((i) => i.product_id as string)
  const { data: products, error } = await admin
    .from('products')
    .select(
      'id, price_monthly, price_quarterly, price_yearly, box_type, is_active'
    )
    .in('id', productIds)

  if (error) {
    return { ok: false, error: 'Erro ao carregar produtos' }
  }

  const byId = new Map((products ?? []).map((p) => [p.id, p]))
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
          ...params.shipping,
          valor: 0,
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

  const match =
    quotes.find(
      (q) =>
        q.codigoServico === params.shipping.codigoServico &&
        (!params.shipping.transportadora ||
          q.transportadora === params.shipping.transportadora) &&
        (!params.shipping.nomeServico ||
          q.nomeServico === params.shipping.nomeServico)
    ) ??
    quotes.find((q) => q.codigoServico === params.shipping.codigoServico)

  if (!match) {
    return { ok: false, error: 'Opção de frete inválida ou expirada' }
  }

  const shipping: ShippingSelection = {
    tipo: params.shipping.tipo,
    valor: match.valor,
    prazoDias: match.prazoDias,
    codigoServico: match.codigoServico,
    transportadora: match.transportadora,
    nomeServico: match.nomeServico,
  }

  const serverTotal = roundMoney(productsSubtotal + shipping.valor)
  return { ok: true, priced: { serverTotal, productsSubtotal, shipping } }
}
