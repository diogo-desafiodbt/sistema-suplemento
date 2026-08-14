import { claimOnce, markClaimCompleted, releaseClaim } from '@/lib/idempotency'
import {
  buildPharmacyItem,
  buildPharmacyJson,
} from '@/lib/pharmacy/json-builder'
import {
  getPharmacyCycleMultiplier,
  getPharmacySkuKey,
  getUnitPriceFromProduct,
} from '@/lib/plans'
import {
  computePackageDimensions,
  type PackageItem,
} from '@/lib/shipping/package'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ShippingSelection } from '@/types/shipping'
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

type AdminClient = ReturnType<typeof createAdminClient>

/** Pedido pronto pra farmácia: tem pharmacy_json e pelo menos 1 item. */
async function isOrderFullyBuilt(
  admin: AdminClient,
  orderId: string,
): Promise<boolean> {
  const { data: order } = await admin
    .from('orders')
    .select('id, pharmacy_json')
    .eq('id', orderId)
    .maybeSingle()
  if (!order?.pharmacy_json) return false

  const { count } = await admin
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)

  return (count ?? 0) > 0
}

export const pharmacyOrder = inngest.createFunction(
  {
    id: 'pharmacy-order',
    name: 'Enviar pedido para farmácia',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event }) => {
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

    const admin = createAdminClient()

    let payment: { id: string } | null = null

    if (eventPaymentId) {
      const { data } = await admin
        .from('payments')
        .select('id')
        .eq('id', eventPaymentId)
        .eq('subscription_id', subscription_id)
        .maybeSingle()
      payment = data
    } else {
      // Sem payment_id: pega o pago mais recente que ainda NÃO tem despacho completo.
      // Evita tratar renovação como already_dispatched do ciclo anterior.
      const { data: candidates } = await admin
        .from('payments')
        .select('id')
        .eq('subscription_id', subscription_id)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(20)

      for (const candidate of candidates ?? []) {
        const { data: dispatchLog } = await admin
          .from('pharmacy_order_dispatch_logs')
          .select('completed_at')
          .eq('payment_id', candidate.id)
          .maybeSingle()
        if (!dispatchLog?.completed_at) {
          payment = candidate
          break
        }
      }
    }

    const { data: subscription, error: subError } = await admin
      .from('subscriptions')
      .select(`
        id,
        plan_type,
        user_id,
        protocol_id,
        pending_checkout,
        users!inner (
          id,
          full_name,
          email,
          cpf,
          phone,
          client_code,
          addresses (
            zip_code,
            street,
            number,
            complement,
            neighborhood,
            city,
            state,
            is_default
          )
        ),
        protocols!inner (
          protocol_items (
            product_id,
            removed_by_patient,
            quantity,
            products (
              name,
              pharmacy_sku_monthly,
              pharmacy_sku_quarterly,
              pharmacy_sku_yearly,
              pharmacy_code,
              price_monthly,
              price_quarterly,
              price_yearly,
              box_type
            )
          )
        )
      `)
      .eq('id', subscription_id)
      .eq('user_id', user_id)
      .single()

    if (subError || !subscription) {
      throw new Error(
        `Assinatura não encontrada: ${subError?.message ?? subscription_id}`,
      )
    }

    if (!payment?.id) {
      throw new Error(
        eventPaymentId
          ? `pharmacy-order: payment ${eventPaymentId} não pertence à subscription ${subscription_id}`
          : `pharmacy-order: nenhum payment pago pendente de despacho para subscription ${subscription_id}`,
      )
    }

    const user = subscription.users as unknown as {
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

    const address = user.addresses?.find((a) => a.is_default)
    if (!address) {
      throw new Error(`Endereço padrão não encontrado para usuário ${user_id}`)
    }

    const protocol = subscription.protocols as unknown as {
      protocol_items: ProtocolItemRow[]
    }

    const planType = subscription.plan_type as string
    const skuKey = getPharmacySkuKey(planType)

    const pending = subscription.pending_checkout as {
      shipping?: ShippingSelection
      protocol_items?: Array<{
        product_id?: string
        removed?: boolean
        blocked?: boolean
      }>
      fulfillment_locked_at?: string
    } | null
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

    const { data: configs, error: configError } = await admin
      .from('system_config')
      .select('key, value')
      .in('key', [
        'pharmacy_carrier_code',
        'pharmacy_payment_code',
        'pharmacy_company_id',
      ])

    if (configError) {
      throw new Error(`Erro ao buscar system_config: ${configError.message}`)
    }

    const configMap = Object.fromEntries(
      (configs ?? []).map((c) => [c.key, c.value]),
    )

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
        item.quantity && item.quantity > 0 ? item.quantity : cycleDivisor
      const checkoutQty = Math.max(1, Math.round(physicalQty / cycleDivisor))
      return (
        sum + getUnitPriceFromProduct(item.products, planType) * checkoutQty
      )
    }, 0)

    const freteValor = shipping?.valor ?? 0
    const prazoDias = shipping?.prazoDias ?? 0

    const { data: priorOrder } = await admin
      .from('orders')
      .select('id')
      .eq('user_id', user_id)
      .not('pharmacy_sent_at', 'is', null)
      .limit(1)
      .maybeSingle()

    const pharmacyItems = activeItems.map((item) => {
      const physicalQty =
        item.quantity && item.quantity > 0 ? item.quantity : cycleDivisor
      const cycleCharge = getUnitPriceFromProduct(item.products, planType)
      // Preço unitário físico = cobrança do ciclo ÷ unidades do ciclo (não ÷ physicalQty total).
      const unitForPharmacy = cycleCharge / cycleDivisor
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
      admin,
      'pharmacy_order_dispatch_logs',
      { payment_id: payment.id },
      { completedColumn: 'completed_at' },
    )

    if (!won) {
      const { data: existingClaim } = await admin
        .from('pharmacy_order_dispatch_logs')
        .select('order_id, completed_at')
        .eq('payment_id', payment.id)
        .maybeSingle()

      if (existingClaim?.completed_at) {
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
        (await isOrderFullyBuilt(admin, linkedOrderId))
      ) {
        await markClaimCompleted(
          admin,
          'pharmacy_order_dispatch_logs',
          'payment_id',
          payment.id,
          'completed_at',
        )
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
      if (await isOrderFullyBuilt(admin, orphanOrderId)) {
        await admin
          .from('pharmacy_order_dispatch_logs')
          .update({ order_id: orphanOrderId })
          .eq('payment_id', payment.id)
        await markClaimCompleted(
          admin,
          'pharmacy_order_dispatch_logs',
          'payment_id',
          payment.id,
          'completed_at',
        )
        return {
          ok: true,
          skipped: 'reclaimed_complete_order',
          orderId: orphanOrderId,
        }
      }
      await admin.from('order_items').delete().eq('order_id', orphanOrderId)
      await admin.from('orders').delete().eq('id', orphanOrderId)
    }

    // Cria o pedido primeiro pra ter o id no CodigoPedidoExterno
    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        user_id,
        subscription_id,
        status: 'pending',
        total_amount: productsSubtotal + freteValor,
        shipping_service_code: shipping?.codigoServico ?? '',
        shipping_quote_json: shipping ?? null,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      await releaseClaim(
        admin,
        'pharmacy_order_dispatch_logs',
        'payment_id',
        payment.id,
      )
      throw new Error(
        `Erro ao criar pedido: ${orderError?.message ?? 'unknown'}`,
      )
    }

    try {
      const { error: claimOrderLinkError } = await admin
        .from('pharmacy_order_dispatch_logs')
        .update({ order_id: order.id })
        .eq('payment_id', payment.id)
      if (claimOrderLinkError) {
        throw new Error(
          `pharmacy-order: falha ao gravar order_id na claim: ${claimOrderLinkError.message}`,
        )
      }

      const pharmacyJson = buildPharmacyJson({
        orderId: order.id,
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
        pharmacyCarrierCode: parseInt(
          configMap.pharmacy_carrier_code ?? '24',
          10,
        ),
        pharmacyPaymentCode: parseInt(
          configMap.pharmacy_payment_code ?? '15',
          10,
        ),
        pharmacyCompanyId: parseInt(configMap.pharmacy_company_id ?? '2', 10),
        pesoLiquido: dimensions.peso,
        clienteExistente: !!priorOrder,
      })

      const { error: pharmacyJsonError } = await admin
        .from('orders')
        .update({ pharmacy_json: pharmacyJson })
        .eq('id', order.id)

      if (pharmacyJsonError) {
        throw new Error(
          `Erro ao salvar pharmacy_json: ${pharmacyJsonError.message}`,
        )
      }

      const { error: itemsError } = await admin.from('order_items').insert(
        activeItems.map((item) => {
          const physicalQty =
            item.quantity && item.quantity > 0 ? item.quantity : cycleDivisor
          const cycleCharge = getUnitPriceFromProduct(item.products, planType)
          // Mesma regra do pharmacyItems / productsSubtotal.
          const unitPrice = cycleCharge / cycleDivisor
          return {
            order_id: order.id,
            product_id: item.product_id,
            pharmacy_sku: item.products?.[skuKey] ?? '',
            quantity: physicalQty,
            unit_price: unitPrice,
          }
        }),
      )

      if (itemsError) {
        throw new Error(`Erro ao criar itens do pedido: ${itemsError.message}`)
      }
    } catch (err) {
      // Claim primeiro: order_id referencia orders (sem ON DELETE CASCADE).
      await releaseClaim(
        admin,
        'pharmacy_order_dispatch_logs',
        'payment_id',
        payment.id,
      )
      await admin.from('orders').delete().eq('id', order.id)
      throw err
    }

    await markClaimCompleted(
      admin,
      'pharmacy_order_dispatch_logs',
      'payment_id',
      payment.id,
      'completed_at',
    )

    return { orderId: order.id }
  },
)
