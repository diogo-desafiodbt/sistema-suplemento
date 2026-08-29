import { claimOnce, markClaimCompleted, releaseClaim } from '@/lib/idempotency'
import { asNumber, getSql, withTransaction } from '@/lib/db'
import {
  buildPharmacyItem,
  buildPharmacyJson,
} from '@/lib/pharmacy/json-builder'
import {
  getPharmacyCycleMultiplier,
  getPharmacySkuKey,
  getUnitPriceFromProduct,
} from '@/lib/plans'
import { ensureProtocolAfterPayment } from '@/lib/protocol/create-from-checkout'
import {
  computePackageDimensions,
  type PackageItem,
} from '@/lib/shipping/package'
import type { ShippingSelection } from '@/types/shipping'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

type ProtocolItemRow = {
  product_id: string
  removed_by_patient: boolean
  quantity?: number | null
  products: {
    name: string
    pharmacy_sku_monthly: string
    pharmacy_sku_quarterly: string
    pharmacy_sku_yearly: string
    pharmacy_code: number | null
    price_monthly: number | null
    price_quarterly: number | null
    price_yearly: number | null
    box_type: string | null
  } | null
}

type SubscriptionRow = {
  id: string
  plan_type: string
  user_id: string
  protocol_id: string | null
  pending_checkout: {
    shipping?: ShippingSelection
    protocol_items?: Array<{
      product_id?: string
      removed?: boolean
      blocked?: boolean
    }>
    fulfillment_locked_at?: string
  } | null
  users: {
    id: string
    full_name: string
    email: string
    cpf: string | null
    phone: string | null
    client_code: string
    addresses: Array<{
      zip_code: string
      street: string
      number: string
      complement?: string
      neighborhood: string
      city: string
      state: string
      is_default: boolean
    }>
  }
  protocols: {
    protocol_items: ProtocolItemRow[]
  }
}

function coerceProductPrices(
  products: ProtocolItemRow['products'],
): ProtocolItemRow['products'] {
  if (!products) return null
  return {
    ...products,
    price_monthly:
      products.price_monthly == null ? null : asNumber(products.price_monthly),
    price_quarterly:
      products.price_quarterly == null
        ? null
        : asNumber(products.price_quarterly),
    price_yearly:
      products.price_yearly == null ? null : asNumber(products.price_yearly),
  }
}

/** Pedido pronto pra farmácia: tem pharmacy_json e pelo menos 1 item. */
async function isOrderFullyBuilt(orderId: string): Promise<boolean> {
  const sql = getSql()
  const orderRows = await sql<{ id: string; pharmacy_json: unknown }[]>`
    SELECT id, pharmacy_json FROM orders
    WHERE id = ${orderId}::uuid
    LIMIT 1
  `
  const order = orderRows[0] ?? null
  if (!order?.pharmacy_json) return false

  const countRows = await sql<{ n: string | number }[]>`
    SELECT COUNT(*) AS n FROM order_items WHERE order_id = ${orderId}::uuid
  `
  return asNumber(countRows[0]?.n) > 0
}

export const pharmacyOrder = inngest.createFunction(
  {
    id: 'pharmacy-order',
    name: 'Enviar pedido para farmácia',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event }) => {
    const jobId = await registrarInicio('pharmacy_order')
    try {
    const {
      subscription_id,
      user_id,
      payment_id: eventPaymentId,
    } = event.data as {
      subscription_id: string
      user_id: string
      payment_id?: string
    }

    if (!subscription_id || !user_id) {
      throw new Error(
        'Evento pagamento/confirmado sem subscription_id ou user_id',
      )
    }

    const sql = getSql()

    let payment: { id: string } | null = null

    if (eventPaymentId) {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM payments
        WHERE id = ${eventPaymentId}::uuid
          AND subscription_id = ${subscription_id}::uuid
        LIMIT 1
      `
      payment = rows[0] ?? null
    } else {
      const candidates = await sql<{ id: string }[]>`
        SELECT id FROM payments
        WHERE subscription_id = ${subscription_id}::uuid AND status = 'paid'
        ORDER BY created_at DESC
        LIMIT 20
      `

      for (const candidate of candidates) {
        const dispatchLog = await sql<{ completed_at: string | Date | null }[]>`
          SELECT completed_at FROM pharmacy_order_dispatch_logs
          WHERE payment_id = ${candidate.id}::uuid
          LIMIT 1
        `
        if (!dispatchLog[0]?.completed_at) {
          payment = candidate
          break
        }
      }
    }

    const protocolRows = await sql<{ protocol_id: string | null }[]>`
      SELECT protocol_id FROM subscriptions
      WHERE id = ${subscription_id}::uuid AND user_id = ${user_id}::uuid
      LIMIT 1
    `
    const protocolRow = protocolRows[0]
    if (!protocolRow) {
      throw new Error(`Assinatura não encontrada: ${subscription_id}`)
    }

    let protocolId = protocolRow.protocol_id
    if (!protocolId) {
      protocolId = await ensureProtocolAfterPayment(subscription_id, user_id)
    }
    if (!protocolId) {
      console.error(
        'pharmacy-order: protocolo ausente após ensureProtocolAfterPayment',
        subscription_id,
      )
      await registrarFim(jobId, {
        status: 'failed',
        payload: { subscription_id, reason: 'protocolo_ausente' },
      })
      return { ok: false, reason: 'protocolo_ausente' }
    }

    const rows = await sql<SubscriptionRow[]>`
      SELECT
        s.id, s.plan_type, s.user_id, s.protocol_id, s.pending_checkout,
        jsonb_build_object(
          'id', u.id, 'full_name', u.full_name, 'email', u.email,
          'cpf', u.cpf, 'phone', u.phone, 'client_code', u.client_code,
          'addresses', COALESCE(addr.list, '[]'::jsonb)
        ) AS users,
        jsonb_build_object('protocol_items', COALESCE(items.list, '[]'::jsonb)) AS protocols
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN protocols p ON p.id = s.protocol_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'zip_code', a.zip_code, 'street', a.street, 'number', a.number,
          'complement', a.complement, 'neighborhood', a.neighborhood,
          'city', a.city, 'state', a.state, 'is_default', a.is_default
        ) ORDER BY a.id) AS list
        FROM addresses a WHERE a.user_id = u.id
      ) addr ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'product_id', pi.product_id,
          'removed_by_patient', pi.removed_by_patient,
          'quantity', pi.quantity,
          'products', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
            'name', pr.name,
            'pharmacy_sku_monthly', pr.pharmacy_sku_monthly,
            'pharmacy_sku_quarterly', pr.pharmacy_sku_quarterly,
            'pharmacy_sku_yearly', pr.pharmacy_sku_yearly,
            'pharmacy_code', pr.pharmacy_code,
            'price_monthly', pr.price_monthly,
            'price_quarterly', pr.price_quarterly,
            'price_yearly', pr.price_yearly,
            'box_type', pr.box_type
          ) END
        ) ORDER BY pi.id) AS list
        FROM protocol_items pi
        LEFT JOIN products pr ON pr.id = pi.product_id
        WHERE pi.protocol_id = p.id
      ) items ON true
      WHERE s.id = ${subscription_id}::uuid AND s.user_id = ${user_id}::uuid
      LIMIT 1
    `

    const subscription = rows[0]
    if (!subscription) {
      throw new Error(`Assinatura não encontrada: ${subscription_id}`)
    }

    if (!payment?.id) {
      throw new Error(
        eventPaymentId
          ? `pharmacy-order: payment ${eventPaymentId} não pertence à subscription ${subscription_id}`
          : `pharmacy-order: nenhum payment pago pendente de despacho para subscription ${subscription_id}`,
      )
    }

    const user = subscription.users

    const address = user.addresses?.find((a) => a.is_default)
    if (!address) {
      throw new Error(`Endereço padrão não encontrado para usuário ${user_id}`)
    }

    const protocol = {
      protocol_items: (subscription.protocols.protocol_items ?? []).map(
        (item) => ({
          ...item,
          products: coerceProductPrices(item.products),
        }),
      ),
    }

    const planType = subscription.plan_type
    const skuKey = getPharmacySkuKey(planType)

    const pending = subscription.pending_checkout
    const shipping = pending?.shipping

    // Prefer snapshot do pagamento (itens travados) — não confiar em edits pós-pago.
    const lockedProductIds = pending?.fulfillment_locked_at
      ? new Set(
          (pending.protocol_items ?? [])
            .filter(
              (i) =>
                !i.removed && !i.blocked && typeof i.product_id === 'string',
            )
            .map((i) => i.product_id as string),
        )
      : null

    const activeItems = (protocol.protocol_items ?? []).filter((item) => {
      if (lockedProductIds) return lockedProductIds.has(item.product_id)
      return !item.removed_by_patient
    })

    if (activeItems.length === 0) {
      throw new Error(
        `Nenhum item ativo no protocolo da assinatura ${subscription_id}`,
      )
    }

    const configs = await sql<{ key: string; value: string }[]>`
      SELECT key, value FROM system_config
      WHERE key = ANY(${sql.array([
        'pharmacy_carrier_code',
        'pharmacy_payment_code',
        'pharmacy_company_id',
      ])}::text[])
    `

    const configMap = Object.fromEntries(configs.map((c) => [c.key, c.value]))

    // TODO(Miligrama): 3meses/6meses = N× SKU mensal num único pedido — validar operacionalmente.
    const cycleMult = getPharmacyCycleMultiplier(planType)
    const cycleDivisor = Math.max(1, cycleMult)

    const packageItems: PackageItem[] = activeItems
      .map((item) => {
        const box = item.products?.box_type
        if (box !== 'R80' && box !== 'R110') return null
        const physicalQty =
          item.quantity && item.quantity > 0 ? item.quantity : cycleDivisor
        return { box_type: box, quantity: physicalQty }
      })
      .filter((x): x is PackageItem => x !== null)

    const dimensions = await computePackageDimensions(packageItems)

    // protocol_items.quantity é física (checkout_qty × cycleMult).
    // getUnitPriceFromProduct já devolve o valor cobrado do ciclo por 1 unidade de checkout.
    // Subtotal cobrado = cycleCharge × checkout_qty (= physicalQty / cycleMult).
    const productsSubtotal = activeItems.reduce((sum, item) => {
      const physicalQty =
        item.quantity && asNumber(item.quantity) > 0
          ? asNumber(item.quantity)
          : cycleDivisor
      const checkoutQty = Math.max(1, Math.round(physicalQty / cycleDivisor))
      return (
        sum +
        asNumber(getUnitPriceFromProduct(item.products, planType)) * checkoutQty
      )
    }, 0)

    const freteValor = shipping?.valor ?? 0
    const prazoDias = shipping?.prazoDias ?? 0

    const priorRows = await sql<{ id: string }[]>`
      SELECT id FROM orders
      WHERE user_id = ${user_id}::uuid AND pharmacy_sent_at IS NOT NULL
      LIMIT 1
    `
    const priorOrder = priorRows[0] ?? null

    const pharmacyItems = activeItems.map((item) => {
      const physicalQty =
        item.quantity && asNumber(item.quantity) > 0
          ? asNumber(item.quantity)
          : cycleDivisor
      const cycleCharge = getUnitPriceFromProduct(item.products, planType)
      const unitForPharmacy = asNumber(cycleCharge) / cycleDivisor
      return buildPharmacyItem({
        sku: item.products?.[skuKey] ?? '',
        pharmacyCode: item.products?.pharmacy_code ?? 0,
        name: item.products?.name ?? '',
        unitPrice: unitForPharmacy,
        quantity: physicalQty,
      })
    })

    // Claim só depois das leituras — se falhar depois, apaga pra o retry do Inngest funcionar.
    const { won, reclaimedStale } = await claimOnce(
      'pharmacy_order_dispatch_logs',
      { payment_id: payment.id },
      { completedColumn: 'completed_at' },
    )

    if (!won) {
      const existingClaimRows = await sql<
        { order_id: string | null; completed_at: string | Date | null }[]
      >`
        SELECT order_id, completed_at FROM pharmacy_order_dispatch_logs
        WHERE payment_id = ${payment.id}::uuid
        LIMIT 1
      `
      const existingClaim = existingClaimRows[0] ?? null

      if (existingClaim?.completed_at) {
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
          payload: { subscription_id, skipped: 'already_dispatched' },
        })
        return {
          ok: true,
          skipped: 'already_dispatched',
          payment_id: payment.id,
          orderId: existingClaim.order_id,
        }
      }

      // Pedido completo mas markClaimCompleted nunca rodou (crash entre o fim e o stamp).
      const linkedOrderId = existingClaim?.order_id
      if (
        typeof linkedOrderId === 'string' &&
        linkedOrderId &&
        (await isOrderFullyBuilt(linkedOrderId))
      ) {
        await markClaimCompleted(
          'pharmacy_order_dispatch_logs',
          'payment_id',
          payment.id,
          'completed_at',
        )
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
          payload: { subscription_id, skipped: 'already_dispatched' },
        })
        return {
          ok: true,
          skipped: 'already_dispatched',
          payment_id: payment.id,
          orderId: linkedOrderId,
        }
      }

      // Outra execução ainda no meio, ou claim morta sem pedido utilizável.
      throw new Error(
        `pharmacy-order: claim em andamento sem pedido completo para payment ${payment.id}`,
      )
    }

    // Pedido incompleto de execução anterior que morreu no meio — limpa antes de recriar.
    // Se o reclaim pegou um pedido já completo (completed_at nunca marcado), não apaga.
    const orphanOrderId = reclaimedStale?.order_id
    if (typeof orphanOrderId === 'string' && orphanOrderId) {
      if (await isOrderFullyBuilt(orphanOrderId)) {
        await sql`
          UPDATE pharmacy_order_dispatch_logs
          SET order_id = ${orphanOrderId}::uuid
          WHERE payment_id = ${payment.id}::uuid
        `
        await markClaimCompleted(
          'pharmacy_order_dispatch_logs',
          'payment_id',
          payment.id,
          'completed_at',
        )
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
          payload: { subscription_id, skipped: 'reclaimed_complete_order' },
        })
        return {
          ok: true,
          skipped: 'reclaimed_complete_order',
          orderId: orphanOrderId,
        }
      }
      await sql`DELETE FROM order_items WHERE order_id = ${orphanOrderId}::uuid`
      await sql`DELETE FROM orders WHERE id = ${orphanOrderId}::uuid`
    }

    const orderId = crypto.randomUUID()
    const pharmacyJson = buildPharmacyJson({
      orderId,
      clientCode: user.client_code,
      cpf: user.cpf,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      address,
      items: pharmacyItems,
      productsSubtotal,
      freteValor,
      prazoDias,
      prescriptionPdfUrl: '',
      pharmacyCarrierCode: parseInt(configMap.pharmacy_carrier_code ?? '24', 10),
      pharmacyPaymentCode: parseInt(configMap.pharmacy_payment_code ?? '15', 10),
      pharmacyCompanyId: parseInt(configMap.pharmacy_company_id ?? '2', 10),
      pesoLiquido: dimensions.peso,
      clienteExistente: !!priorOrder,
    })

    const orderItems = activeItems.map((item) => {
      const physicalQty =
        item.quantity && asNumber(item.quantity) > 0
          ? asNumber(item.quantity)
          : cycleDivisor
      const cycleCharge = getUnitPriceFromProduct(item.products, planType)
      const unitPrice = asNumber(cycleCharge) / cycleDivisor
      return {
        order_id: orderId,
        product_id: item.product_id,
        pharmacy_sku: item.products?.[skuKey] ?? '',
        quantity: physicalQty,
        unit_price: unitPrice,
      }
    })

    try {
      await withTransaction(async (tx) => {
        await tx`
          INSERT INTO orders (
            id,
            user_id,
            subscription_id,
            status,
            total_amount,
            shipping_service_code,
            shipping_quote_json,
            pharmacy_json
          )
          VALUES (
            ${orderId}::uuid,
            ${user_id}::uuid,
            ${subscription_id}::uuid,
            'pending',
            ${productsSubtotal + freteValor},
            ${shipping?.codigoServico ?? ''},
            ${tx.json((shipping ?? null) as never)},
            ${tx.json(pharmacyJson as never)}
          )
        `
        await tx`
          UPDATE pharmacy_order_dispatch_logs
          SET order_id = ${orderId}::uuid
          WHERE payment_id = ${payment.id}::uuid
        `
        await tx`INSERT INTO order_items ${tx(orderItems)}`
      })
    } catch (err) {
      await releaseClaim(
        'pharmacy_order_dispatch_logs',
        'payment_id',
        payment.id,
      )
      throw err
    }

    await markClaimCompleted(
      'pharmacy_order_dispatch_logs',
      'payment_id',
      payment.id,
      'completed_at',
    )

    // A etiqueta é criada a partir daqui, e não do `pagamento/confirmado`.
    // As duas funções escutavam o mesmo evento e corriam em paralelo: a da
    // etiqueta só não quebrava porque dormia dois dias antes de procurar o
    // pedido. Com a emissão imediata, o encadeamento tem que ser explícito.
    //
    // Falhar aqui não desfaz o pedido, que já está gravado. O vigia cobra
    // pedido sem etiqueta.
    try {
      await inngest.send({
        name: 'pedido/criado',
        data: { order_id: orderId, subscription_id, user_id },
      })
    } catch (eventError) {
      console.error(
        `[pharmacy-order] pedido ${orderId} criado, evento pedido/criado não enviado:`,
        eventError,
      )
    }

    await registrarFim(jobId, {
      status: 'completed',
      affectedRows: 1,
      payload: { subscription_id, orderId },
    })
    return { orderId }
    } catch (error) {
      await registrarFim(jobId, {
        status: 'failed',
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  },
)
