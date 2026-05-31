import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardNav } from '@/components/patient/DashboardNav'
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
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between">
        <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-[#f4001e] font-medium hover:underline">Sair</button>
        </form>
      </header>

      <DashboardNav />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Seu tratamento</p>
          <h1 className="text-2xl font-bold text-[#13244f]">Meu Protocolo</h1>
        </div>

        {/* Status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
          <p className="text-sm font-medium text-[#13244f]">Status do pedido</p>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${getPatientOrderStatusColor(orderStatus)}`}>
            {orderStatus}
          </span>
        </div>

        {/* Rastreio */}
        {orderStatus === 'Em trânsito' && latestOrder?.tracking_code && (
          <div className="bg-[#13244f] rounded-2xl p-5 text-white">
            <p className="text-xs font-bold tracking-widest uppercase opacity-60 mb-1">Código de rastreio</p>
            <p className="font-mono font-bold text-lg">{latestOrder.tracking_code}</p>
          </div>
        )}

        {/* Suplementos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Seus suplementos</p>
          {activeItems?.map(item => (
            <div key={item.id} className="flex items-start justify-between gap-4 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-[#13244f]">{item.products?.name}</span>
                  {item.is_required && (
                    <span className="text-[10px] bg-[#13244f]/10 text-[#13244f] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Principal</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.activation_reason}</p>
              </div>
              <span className="text-sm font-bold text-[#13244f] flex-shrink-0">
                R$ {item.products?.price_monthly?.toFixed(2).replace('.', ',')}
                <span className="text-xs font-normal text-gray-400">/mês</span>
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
