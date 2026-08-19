import { asNumber, getSql } from '@/lib/db'
import { getCotacao } from '@/lib/shipping/envie-agora/cotacao'
import { criarEtiqueta } from '@/lib/shipping/envie-agora/etiqueta'
import {
  computePackageDimensions,
  type PackageItem,
} from '@/lib/shipping/package'
import type { ShippingSelection } from '@/types/shipping'

type ProtocolProduct = {
  box_type: string | null
  price_monthly: number | null
}

type OrderRow = {
  id: string
  user_id: string
  total_amount: string | number | null
  shipping_service_code: string | null
  shipping_quote_json: unknown
  shipping_request_id: string | null
  subscription_id: string | null
  users: {
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
  subscriptions: {
    plan_type: string
    pending_checkout: {
      shipping?: ShippingSelection
      protocol_items?: Array<{
        product_id?: string
        removed?: boolean
        blocked?: boolean
      }>
      fulfillment_locked_at?: string
    } | null
    protocols: {
      protocol_items: Array<{
        product_id: string
        removed_by_patient: boolean
        products: ProtocolProduct | null
      }>
    } | null
  } | null
}

/**
 * Cria etiqueta na Envie Agora para um pedido.
 * Usa shipping_service_code salvo; se vazio, cotação de segurança (mais barato).
 */
export async function createShippingLabelForOrder(orderId: string): Promise<{
  id_requisicao: string
}> {
  const sql = getSql()

  const rows = await sql<OrderRow[]>`
    SELECT
      o.id, o.user_id, o.total_amount, o.shipping_service_code,
      o.shipping_quote_json, o.shipping_request_id, o.subscription_id,
      jsonb_build_object(
        'full_name', u.full_name, 'cpf', u.cpf, 'phone', u.phone,
        'addresses', COALESCE(addr.list, '[]'::jsonb)
      ) AS users,
      CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
        'plan_type', s.plan_type,
        'pending_checkout', s.pending_checkout,
        'protocols', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
          'protocol_items', COALESCE(items.list, '[]'::jsonb)
        ) END
      ) END AS subscriptions
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'zip_code', a.zip_code, 'street', a.street, 'number', a.number,
        'complement', a.complement, 'neighborhood', a.neighborhood,
        'city', a.city, 'state', a.state, 'is_default', a.is_default
      ) ORDER BY a.id) AS list
      FROM addresses a WHERE a.user_id = u.id
    ) addr ON true
    LEFT JOIN subscriptions s ON s.id = o.subscription_id
    LEFT JOIN protocols p ON p.id = s.protocol_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'product_id', pi.product_id,
        'removed_by_patient', pi.removed_by_patient,
        'products', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
          'box_type', pr.box_type, 'price_monthly', pr.price_monthly
        ) END
      ) ORDER BY pi.id) AS list
      FROM protocol_items pi
      LEFT JOIN products pr ON pr.id = pi.product_id
      WHERE pi.protocol_id = p.id
    ) items ON true
    WHERE o.id = ${orderId}::uuid
    LIMIT 1
  `

  const order = rows[0]
  if (!order) {
    throw new Error(`Pedido não encontrado: ${orderId}`)
  }

  if (order.shipping_request_id) {
    return { id_requisicao: order.shipping_request_id as string }
  }

  const subscription = order.subscriptions

  const pending = subscription?.pending_checkout
  const lockedProductIds = pending?.fulfillment_locked_at
    ? new Set(
        (pending.protocol_items ?? [])
          .filter(
            (i) => !i.removed && !i.blocked && typeof i.product_id === 'string',
          )
          .map((i) => i.product_id as string),
      )
    : null

  const protocolItems = (subscription?.protocols?.protocol_items ?? []).filter(
    (i) =>
      lockedProductIds
        ? lockedProductIds.has(i.product_id)
        : !i.removed_by_patient,
  )

  const packageItems: PackageItem[] = protocolItems
    .map((i) => {
      const box = i.products?.box_type
      if (box !== 'R80' && box !== 'R110') return null
      return { box_type: box, quantity: 1 }
    })
    .filter((x): x is PackageItem => x !== null)

  const dimensions = await computePackageDimensions(packageItems)

  const productsValue = protocolItems.reduce(
    (sum, i) => sum + asNumber(i.products?.price_monthly),
    0,
  )
  const valorDeclarado =
    productsValue > 0 ? productsValue : asNumber(order.total_amount)

  let codigoServico = (order.shipping_service_code as string | null) ?? ''

  if (!codigoServico) {
    const user = order.users
    const address =
      user.addresses?.find((a) => a.is_default) ?? user.addresses?.[0]
    if (!address) throw new Error('Endereço ausente para cotação de fallback')

    const quotes = await getCotacao({
      cepdestino: address.zip_code,
      destinoUf: address.state,
      valordeclarado: valorDeclarado,
      dimensions,
    })
    if (quotes.length === 0) {
      throw new Error('Cotação de fallback vazia — sem código de serviço')
    }
    const cheapest = quotes.reduce((a, b) => (a.valor <= b.valor ? a : b))
    codigoServico = cheapest.codigoServico

    await sql`
      UPDATE orders
      SET
        shipping_service_code = ${codigoServico},
        shipping_quote_json = ${sql.json({
          tipo: 'padrao',
          valor: cheapest.valor,
          prazoDias: cheapest.prazoDias,
          codigoServico,
        })}
      WHERE id = ${orderId}::uuid
    `
  }

  const user = order.users

  const response = await criarEtiqueta({
    order: {
      id: order.id,
      total_amount:
        order.total_amount == null ? null : asNumber(order.total_amount),
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

  await sql`
    UPDATE orders
    SET
      shipping_request_id = ${response.id_requisicao},
      shipping_json = ${sql.json(response as never)}
    WHERE id = ${orderId}::uuid
  `

  return { id_requisicao: response.id_requisicao }
}
