import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPharmacyJson, buildTransportadoraCodigo, buildFormaPagamentoCodigo } from '@/lib/pharmacy/json-builder'

type ProtocolItemRow = {
  product_id: string
  removed_by_patient: boolean
  products: {
    pharmacy_sku_monthly: string
    pharmacy_sku_quarterly: string
    pharmacy_sku_yearly: string
    pharmacy_code: number | null
  } | null
}

function getSkuKey(planType: string): 'pharmacy_sku_monthly' | 'pharmacy_sku_quarterly' | 'pharmacy_sku_yearly' {
  if (planType === '3meses') return 'pharmacy_sku_quarterly'
  if (planType === '1ano') return 'pharmacy_sku_yearly'
  return 'pharmacy_sku_monthly'
}

export async function POST(request: NextRequest) {
  try {
    const { subscription_id } = await request.json()
    const admin = createAdminClient()

    const { data: subscription } = await admin
      .from('subscriptions')
      .select(`
        id, plan_type,
        users (
          id, full_name, client_code,
          addresses ( zip_code, street, number, complement, neighborhood, city, state, is_default )
        ),
        protocols (
          prescription_pdf_url,
          protocol_items (
            product_id,
            removed_by_patient,
            products ( pharmacy_sku_monthly, pharmacy_sku_quarterly, pharmacy_sku_yearly, pharmacy_code )
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
      .in('key', ['pharmacy_company_id', 'pharmacy_payment_code'])

    const configMap = Object.fromEntries(
      (configs ?? []).map(c => [c.key, c.value])
    )

    const skuKey = getSkuKey(subscription.plan_type)
    const activeItems = (protocol?.protocol_items ?? []).filter(
      item => !item.removed_by_patient
    )

    const pharmacyItems = activeItems.map(item => ({
      CodigoProduto: item.products?.pharmacy_code ?? 0,
      Quantidade: 1,
      CodigoBarras: item.products?.[skuKey] ?? '',
    }))

    const pharmacyJson = buildPharmacyJson({
      clienteCodigo: user.client_code,
      fullName: user.full_name,
      address,
      planType: subscription.plan_type,
      items: pharmacyItems,
      prescriptionPdfUrl: protocol?.prescription_pdf_url ?? '',
      pharmacyCarrierCode: buildTransportadoraCodigo(address.zip_code, user.full_name),
      pharmacyPaymentCode: buildFormaPagamentoCodigo(subscription.plan_type),
      pharmacyCompanyId: parseInt(configMap.pharmacy_company_id ?? '2', 10),
    })

    const { data: order } = await admin
      .from('orders')
      .insert({
        user_id: user.id,
        subscription_id,
        status: 'pending',
        total_amount: 0,
        pharmacy_json: pharmacyJson,
        pharmacy_sent_at: null,
      })
      .select()
      .single()

    if (order && activeItems.length > 0) {
      await admin.from('order_items').insert(
        activeItems.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          pharmacy_sku: item.products?.[skuKey] ?? '',
          quantity: 1,
          unit_price: 0,
        }))
      )
    }

    console.log('PHARMACY JSON (pendente envio):', JSON.stringify(pharmacyJson, null, 2))

    if (order) {
      await admin
        .from('orders')
        .update({ status: 'sent_to_pharmacy', pharmacy_sent_at: new Date().toISOString() })
        .eq('id', order.id)
    }

    return NextResponse.json({ ok: true, order_id: order?.id })
  } catch (error) {
    console.error('Farmacia enviar error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
