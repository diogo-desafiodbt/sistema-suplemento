import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildPharmacyJson,
  buildTransportadoraCodigo,
  buildFormaPagamentoCodigo,
} from '@/lib/pharmacy/json-builder'
import { sendToPharmacy } from '@/lib/pharmacy/sender'
import type { PharmacyOrderItem } from '@/types/pharmacy'

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
  } | null
}

function getSkuKey(planType: string): 'pharmacy_sku_monthly' | 'pharmacy_sku_quarterly' | 'pharmacy_sku_yearly' {
  if (planType === '3meses') return 'pharmacy_sku_quarterly'
  if (planType === '1ano') return 'pharmacy_sku_yearly'
  return 'pharmacy_sku_monthly'
}

function getUnitPrice(
  product: ProtocolItemRow['products'],
  planType: string
): number {
  if (!product) return 0
  if (planType === '3meses') return product.price_quarterly ?? 0
  if (planType === '1ano') return product.price_yearly ?? 0
  return product.price_monthly ?? 0
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
        users!inner (
          id,
          full_name,
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
              price_yearly
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
    const skuKey = getSkuKey(planType)

    const activeItems = (protocol.protocol_items ?? []).filter(
      item => !item.removed_by_patient
    )

    if (activeItems.length === 0) {
      throw new Error(`Nenhum item ativo no protocolo da assinatura ${subscription_id}`)
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
      (configs ?? []).map(c => [c.key, c.value])
    )

    const pharmacyItems: PharmacyOrderItem[] = activeItems.map(item => ({
      CodigoProduto: item.products?.pharmacy_code ?? 0,
      Quantidade: 1,
      CodigoBarras: item.products?.[skuKey] ?? '',
    }))

    const pharmacyJson = buildPharmacyJson({
      clienteCodigo: user.client_code,
      fullName: user.full_name,
      address,
      planType,
      items: pharmacyItems,
      prescriptionPdfUrl: protocol.prescription_pdf_url ?? '',
      pharmacyCarrierCode:
        configMap.pharmacy_carrier_code ??
        buildTransportadoraCodigo(address.zip_code, user.full_name),
      pharmacyPaymentCode:
        configMap.pharmacy_payment_code ?? buildFormaPagamentoCodigo(planType),
      pharmacyCompanyId: parseInt(configMap.pharmacy_company_id ?? '2', 10),
    })

    await sendToPharmacy(pharmacyJson)

    const totalAmount = activeItems.reduce(
      (sum, item) => sum + getUnitPrice(item.products, planType),
      0
    )

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        user_id,
        subscription_id,
        status: 'sent_to_pharmacy',
        total_amount: totalAmount,
        pharmacy_json: pharmacyJson,
        pharmacy_sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (orderError || !order) {
      throw new Error(`Erro ao criar pedido: ${orderError?.message ?? 'unknown'}`)
    }

    const { error: itemsError } = await admin.from('order_items').insert(
      activeItems.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        pharmacy_sku: item.products?.[skuKey] ?? '',
        quantity: 1,
        unit_price: getUnitPrice(item.products, planType),
      }))
    )

    if (itemsError) {
      throw new Error(`Erro ao criar itens do pedido: ${itemsError.message}`)
    }

    return { orderId: order.id }
  }
)
