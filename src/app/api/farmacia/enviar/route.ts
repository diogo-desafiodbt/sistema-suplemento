import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(request: NextRequest) {
  try {
    const { subscription_id } = await request.json()
    const admin = createAdminClient()

    const { data: subscription } = await admin
      .from('subscriptions')
      .select(`
        id, plan_type, pending_checkout,
        users (
          id, full_name, email, cpf, phone, client_code,
          addresses ( zip_code, street, number, complement, neighborhood, city, state, is_default )
        ),
        protocols (
          prescription_pdf_url,
          protocol_items (
            product_id,
            removed_by_patient,
            products (
              name,
              pharmacy_sku_monthly, pharmacy_sku_quarterly, pharmacy_sku_yearly,
              pharmacy_code, price_monthly, price_quarterly, price_yearly, box_type
            )
          )
        )
      `)
      .eq('id', subscription_id)
      .single()

    if (!subscription) {
      return NextResponse.json({ error: 'Assinatura não encontrada' }, { status: 404 })
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

    const address = user.addresses?.find(a => a.is_default) ?? user.addresses?.[0]
    const protocol = subscription.protocols as unknown as {
      prescription_pdf_url: string | null
      protocol_items: ProtocolItemRow[]
    } | null

    if (!address) {
      return NextResponse.json({ error: 'Endereço não encontrado' }, { status: 400 })
    }

    const { data: configs } = await admin
      .from('system_config')
      .select('key, value')
      .in('key', ['pharmacy_company_id', 'pharmacy_payment_code', 'pharmacy_carrier_code'])

    const configMap = Object.fromEntries(
      (configs ?? []).map(c => [c.key, c.value])
    )

    const planType = subscription.plan_type as string
    const skuKey = getPharmacySkuKey(planType)
    const activeItems = (protocol?.protocol_items ?? []).filter(
      item => !item.removed_by_patient
    )

    const pending = subscription.pending_checkout as {
      shipping?: ShippingSelection
    } | null
    const shipping = pending?.shipping
    const freteValor = shipping?.valor ?? 0
    const prazoDias = shipping?.prazoDias ?? 0

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

    const { data: priorOrder } = await admin
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .not('pharmacy_sent_at', 'is', null)
      .limit(1)
      .maybeSingle()

    const { data: order } = await admin
      .from('orders')
      .insert({
        user_id: user.id,
        subscription_id,
        status: 'pending',
        total_amount: productsSubtotal + freteValor,
        pharmacy_sent_at: null,
        shipping_service_code: shipping?.codigoServico ?? '',
        shipping_quote_json: shipping ?? null,
      })
      .select()
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Erro ao criar pedido' }, { status: 500 })
    }

    const pharmacyItems = activeItems.map(item =>
      buildPharmacyItem({
        sku: item.products?.[skuKey] ?? '',
        pharmacyCode: item.products?.pharmacy_code ?? 0,
        name: item.products?.name ?? '',
        unitPrice: getUnitPriceFromProduct(item.products, planType),
      })
    )

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
      prescriptionPdfUrl: protocol?.prescription_pdf_url ?? '',
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

    if (activeItems.length > 0) {
      await admin.from('order_items').insert(
        activeItems.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          pharmacy_sku: item.products?.[skuKey] ?? '',
          quantity: 1,
          unit_price: getUnitPriceFromProduct(item.products, planType),
        }))
      )
    }

    console.log('PHARMACY JSON (pendente envio):', JSON.stringify(pharmacyJson, null, 2))

    await admin
      .from('orders')
      .update({ status: 'sent_to_pharmacy', pharmacy_sent_at: new Date().toISOString() })
      .eq('id', order.id)

    return NextResponse.json({ ok: true, order_id: order.id })
  } catch (error) {
    console.error('Farmacia enviar error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
