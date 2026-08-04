import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPharmacyJson, buildPharmacyItem } from '@/lib/pharmacy/json-builder'
import { getPharmacySkuKey, getUnitPriceFromProduct } from '@/lib/plans'
import { computePackageDimensions, type PackageItem } from '@/lib/shipping/package'
import { claimOnce, releaseClaim, markClaimCompleted } from '@/lib/idempotency'
import type { ShippingSelection } from '@/types/shipping'

type ProtocolItemRow = {
  product_id: string
  removed_by_patient: boolean
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
  orderId: string
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
    const { subscription_id, user_id, payment_id: eventPaymentId } = event.data as {
      subscription_id: string
      user_id: string
      payment_id?: string
    }

    if (!subscription_id || !user_id) {
      throw new Error('Evento pagamento/confirmado sem subscription_id ou user_id')
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
          prescription_pdf_url,
          protocol_items (
            product_id,
            removed_by_patient,
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
      throw new Error(`Assinatura não encontrada: ${subError?.message ?? subscription_id}`)
    }

    if (!payment?.id) {
      throw new Error(
        eventPaymentId
          ? `pharmacy-order: payment ${eventPaymentId} não pertence à subscription ${subscription_id}`
          : `pharmacy-order: nenhum payment pago pendente de despacho para subscription ${subscription_id}`
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

    const address = user.addresses?.find(a => a.is_default)
    if (!address) {
      throw new Error(`Endereço padrão não encontrado para usuário ${user_id}`)
    }

    const protocol = subscription.protocols as unknown as {
      prescription_pdf_url: string | null
      protocol_items: ProtocolItemRow[]
    }

    const planType = subscription.plan_type as string
    const skuKey = getPharmacySkuKey(planType)

    const activeItems = (protocol.protocol_items ?? []).filter(
      item => !item.removed_by_patient
    )

    if (activeItems.length === 0) {
      throw new Error(`Nenhum item ativo no protocolo da assinatura ${subscription_id}`)
    }

    const pending = subscription.pending_checkout as {
      shipping?: ShippingSelection
    } | null
    const shipping = pending?.shipping

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
      (configs ?? []).map(c => [c.key, c.value])
    )

    const packageItems: PackageItem[] = activeItems
      .map(item => {
        const box = item.products?.box_type
        if (box !== 'R80' && box !== 'R110') return null
        return { box_type: box, quantity: 1 }
      })
      .filter((x): x is PackageItem => x !== null)

    const dimensions = await computePackageDimensions(packageItems)

    const productsSubtotal = activeItems.reduce(
      (sum, item) => sum + getUnitPriceFromProduct(item.products, planType),
      0
    )

    const freteValor = shipping?.valor ?? 0
    const prazoDias = shipping?.prazoDias ?? 0

    const { data: priorOrder } = await admin
      .from('orders')
      .select('id')
      .eq('user_id', user_id)
      .not('pharmacy_sent_at', 'is', null)
      .limit(1)
      .maybeSingle()

    const pharmacyItems = activeItems.map(item =>
      buildPharmacyItem({
        sku: item.products?.[skuKey] ?? '',
        pharmacyCode: item.products?.pharmacy_code ?? 0,
        name: item.products?.name ?? '',
        unitPrice: getUnitPriceFromProduct(item.products, planType),
      })
    )

    // Claim só depois das leituras — se falhar depois, apaga pra o retry do Inngest funcionar.
    const { won, reclaimedStale } = await claimOnce(
      admin,
      'pharmacy_order_dispatch_logs',
      { payment_id: payment.id },
      { completedColumn: 'completed_at' }
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
          'completed_at'
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
        `pharmacy-order: claim em andamento sem pedido completo para payment ${payment.id}`
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
          'completed_at'
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
        payment.id
      )
      throw new Error(`Erro ao criar pedido: ${orderError?.message ?? 'unknown'}`)
    }

    try {
      const { error: claimOrderLinkError } = await admin
        .from('pharmacy_order_dispatch_logs')
        .update({ order_id: order.id })
        .eq('payment_id', payment.id)
      if (claimOrderLinkError) {
        throw new Error(
          `pharmacy-order: falha ao gravar order_id na claim: ${claimOrderLinkError.message}`
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
        prescriptionPdfUrl: protocol.prescription_pdf_url ?? '',
        pharmacyCarrierCode: parseInt(configMap.pharmacy_carrier_code ?? '24', 10),
        pharmacyPaymentCode: parseInt(configMap.pharmacy_payment_code ?? '15', 10),
        pharmacyCompanyId: parseInt(configMap.pharmacy_company_id ?? '2', 10),
        pesoLiquido: dimensions.peso,
        clienteExistente: !!priorOrder,
      })

      const { error: pharmacyJsonError } = await admin
        .from('orders')
        .update({ pharmacy_json: pharmacyJson })
        .eq('id', order.id)

      if (pharmacyJsonError) {
        throw new Error(`Erro ao salvar pharmacy_json: ${pharmacyJsonError.message}`)
      }

      const { error: itemsError } = await admin.from('order_items').insert(
        activeItems.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          pharmacy_sku: item.products?.[skuKey] ?? '',
          quantity: 1,
          unit_price: getUnitPriceFromProduct(item.products, planType),
        }))
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
        payment.id
      )
      await admin.from('orders').delete().eq('id', order.id)
      throw err
    }

    await markClaimCompleted(
      admin,
      'pharmacy_order_dispatch_logs',
      'payment_id',
      payment.id,
      'completed_at'
    )

    return { orderId: order.id }
  }
)
