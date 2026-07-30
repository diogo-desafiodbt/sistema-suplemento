import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPharmacyJson, buildPharmacyItem } from '@/lib/pharmacy/json-builder'
import { getPharmacySkuKey, getUnitPriceFromProduct } from '@/lib/plans'
import { computePackageDimensions, type PackageItem } from '@/lib/shipping/package'
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

export const pharmacyOrder = inngest.createFunction(
  {
    id: 'pharmacy-order',
    name: 'Enviar pedido para farmácia',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event }) => {
    const { subscription_id, user_id } = event.data as {
      subscription_id: string
      user_id: string
    }

    if (!subscription_id || !user_id) {
      throw new Error('Evento pagamento/confirmado sem subscription_id ou user_id')
    }

    const admin = createAdminClient()

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
      throw new Error(`Erro ao criar pedido: ${orderError?.message ?? 'unknown'}`)
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

    await admin
      .from('orders')
      .update({ pharmacy_json: pharmacyJson })
      .eq('id', order.id)

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

    return { orderId: order.id }
  }
)
