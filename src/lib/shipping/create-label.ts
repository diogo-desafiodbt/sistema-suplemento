import { createAdminClient } from '@/lib/supabase/admin'
import { computePackageDimensions, type PackageItem } from '@/lib/shipping/package'
import { getCotacao } from '@/lib/shipping/envie-agora/cotacao'
import { criarEtiqueta } from '@/lib/shipping/envie-agora/etiqueta'
import type { ShippingSelection } from '@/types/shipping'

type ProtocolProduct = {
  box_type: string | null
  price_monthly: number | null
}

/**
 * Cria etiqueta na Envie Agora para um pedido.
 * Usa shipping_service_code salvo; se vazio, cotação de segurança (mais barato).
 */
export async function createShippingLabelForOrder(orderId: string): Promise<{
  id_requisicao: string
}> {
  const admin = createAdminClient()

  const { data: order, error } = await admin
    .from('orders')
    .select(`
      id,
      user_id,
      total_amount,
      shipping_service_code,
      shipping_quote_json,
      shipping_request_id,
      subscription_id,
      users!inner (
        full_name,
        cpf,
        phone,
        addresses (
          zip_code, street, number, complement, neighborhood, city, state, is_default
        )
      ),
      subscriptions (
        plan_type,
        pending_checkout,
        protocols (
          protocol_items (
            product_id,
            removed_by_patient,
            products ( box_type, price_monthly )
          )
        )
      )
    `)
    .eq('id', orderId)
    .single()

  if (error || !order) {
    throw new Error(`Pedido não encontrado: ${error?.message ?? orderId}`)
  }

  if (order.shipping_request_id) {
    return { id_requisicao: order.shipping_request_id as string }
  }

  const subscription = order.subscriptions as unknown as {
    plan_type: string
    pending_checkout: { shipping?: ShippingSelection } | null
    protocols: {
      protocol_items: Array<{
        product_id: string
        removed_by_patient: boolean
        products: ProtocolProduct | null
      }>
    } | null
  } | null

  const protocolItems = (subscription?.protocols?.protocol_items ?? []).filter(
    i => !i.removed_by_patient
  )

  const packageItems: PackageItem[] = protocolItems
    .map(i => {
      const box = i.products?.box_type
      if (box !== 'R80' && box !== 'R110') return null
      return { box_type: box, quantity: 1 }
    })
    .filter((x): x is PackageItem => x !== null)

  const dimensions = await computePackageDimensions(packageItems)

  const productsValue = protocolItems.reduce(
    (sum, i) => sum + (i.products?.price_monthly ?? 0),
    0
  )
  const valorDeclarado =
    productsValue > 0 ? productsValue : Number(order.total_amount ?? 0)

  let codigoServico = (order.shipping_service_code as string | null) ?? ''

  if (!codigoServico) {
    const user = order.users as unknown as {
      addresses: Array<{ zip_code: string; is_default: boolean }>
    }
    const address =
      user.addresses?.find(a => a.is_default) ?? user.addresses?.[0]
    if (!address) throw new Error('Endereço ausente para cotação de fallback')

    const quotes = await getCotacao({
      cepdestino: address.zip_code,
      valordeclarado: valorDeclarado,
      dimensions,
    })
    if (quotes.length === 0) {
      throw new Error('Cotação de fallback vazia — sem código de serviço')
    }
    const cheapest = quotes.reduce((a, b) => (a.valor <= b.valor ? a : b))
    codigoServico = cheapest.codigoServico

    await admin
      .from('orders')
      .update({
        shipping_service_code: codigoServico,
        shipping_quote_json: {
          tipo: 'padrao',
          valor: cheapest.valor,
          prazoDias: cheapest.prazoDias,
          codigoServico,
        },
      })
      .eq('id', orderId)
  }

  const user = order.users as unknown as {
    full_name: string
    cpf: string | null
    phone: string | null
    addresses: Array<{
      zip_code: string
      street: string
      number: string
      complement?: string | null
      neighborhood: string
      city: string
      state: string
      is_default: boolean
    }>
  }

  const response = await criarEtiqueta({
    order: {
      id: order.id,
      total_amount: order.total_amount,
      shipping_quote_json: order.shipping_quote_json,
      users: user,
    },
    dimensions,
    codigoServico,
    valorDeclarado,
  })

  if (!response?.id_requisicao) {
    throw new Error('Envie Agora não retornou id_requisicao')
  }

  await admin
    .from('orders')
    .update({
      shipping_request_id: response.id_requisicao,
      shipping_json: response,
    })
    .eq('id', orderId)

  return { id_requisicao: response.id_requisicao }
}

export function mergeTrackingEvents(
  existingJson: unknown,
  newEventos: Array<Record<string, unknown>>
): Record<string, unknown> {
  const base =
    existingJson && typeof existingJson === 'object' && !Array.isArray(existingJson)
      ? { ...(existingJson as Record<string, unknown>) }
      : {}

  const prev = Array.isArray(base.eventos) ? (base.eventos as Array<Record<string, unknown>>) : []
  const byId = new Map<string | number, Record<string, unknown>>()

  for (const ev of prev) {
    const key = (ev.id as string | number | undefined) ?? JSON.stringify(ev)
    byId.set(key, ev)
  }
  for (const ev of newEventos) {
    const key = (ev.id as string | number | undefined) ?? JSON.stringify(ev)
    byId.set(key, { ...byId.get(key), ...ev })
  }

  return { ...base, eventos: Array.from(byId.values()) }
}
