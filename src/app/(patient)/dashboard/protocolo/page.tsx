import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { getPatientOrderStatus, getPatientOrderStatusColor } from '@/lib/order-status'

type ProtocolItem = {
  id: string
  is_required: boolean
  removed_by_patient: boolean
  activation_reason: string | null
  products: {
    name: string
    price_monthly: number | null
    price_quarterly: number | null
    price_yearly: number | null
  } | null
}

type ProtocolDetail = {
  id: string
  protocol_items: ProtocolItem[]
}

export default async function ProtocoloPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: protocol } = await admin
    .from('protocols')
    .select(`
      id,
      protocol_items (
        id, is_required, removed_by_patient, activation_reason,
        products ( name, price_monthly, price_quarterly, price_yearly )
      )
    `)
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!protocol) redirect('/dashboard')

  const { data: latestOrder } = await admin
    .from('orders')
    .select('status, tracking_code')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const protocolData = protocol as unknown as ProtocolDetail
  const activeItems = protocolData.protocol_items?.filter(
    item => !item.removed_by_patient
  )

  const orderStatus = getPatientOrderStatus(
    latestOrder?.status ?? null,
    latestOrder?.tracking_code ?? null
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
        <h1 className="font-semibold">Meu protocolo</h1>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg border p-5 flex items-center justify-between">
          <p className="font-medium">Status do pedido</p>
          <Badge className={`${getPatientOrderStatusColor(orderStatus)} border-0`}>
            {orderStatus}
          </Badge>
        </div>

        {orderStatus === 'Em trânsito' && latestOrder?.tracking_code && (
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-sm">
            <p className="text-blue-700 font-medium">Código de rastreio</p>
            <p className="text-blue-600 font-mono mt-0.5">{latestOrder.tracking_code}</p>
          </div>
        )}

        <div className="bg-white rounded-lg border p-5 space-y-4">
          <h2 className="font-medium">Seus suplementos</h2>
          {activeItems?.map(item => (
            <div key={item.id} className="flex items-start justify-between gap-4 pb-3 border-b last:border-0 last:pb-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{item.products?.name}</span>
                  {item.is_required && <Badge variant="secondary" className="text-xs">Principal</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{item.activation_reason}</p>
              </div>
              <span className="text-sm font-medium text-gray-700">
                R$ {item.products?.price_monthly?.toFixed(2).replace('.', ',')}
                <span className="text-xs text-gray-400 font-normal">/mês</span>
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
