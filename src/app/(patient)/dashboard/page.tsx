import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { getPatientOrderStatus, getPatientOrderStatusColor } from '@/lib/order-status'

type ProtocolItem = {
  is_required: boolean
  removed_by_patient: boolean
  products: { name: string } | null
}

type Protocol = {
  id: string
  protocol_items: ProtocolItem[]
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users')
    .select('full_name, role, client_code')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'professional') redirect('/profissional/fila')
  if (profile?.role === 'admin') redirect('/admin/usuarios')

  const { data: entitlements } = await admin
    .from('user_entitlements')
    .select('product_key, status, expires_at, is_permanent')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const { data: protocol } = await admin
    .from('protocols')
    .select(`
      id,
      protocol_items (
        is_required,
        removed_by_patient,
        products ( name )
      )
    `)
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: latestOrder } = await admin
    .from('orders')
    .select('status, tracking_code')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: orders } = await admin
    .from('orders')
    .select('id, created_at, total_amount')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(3)

  const hasTreatment = entitlements?.some(e => e.product_key === 'treatment')
  const hasDiet = entitlements?.some(e => e.product_key === 'diet')
  const hasGuide = entitlements?.some(e => e.product_key === 'guide')

  const protocolData = protocol as Protocol | null
  const activeItems = protocolData?.protocol_items?.filter(
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
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="text-sm text-[#f4001e] font-medium hover:underline">Sair</button>
          </form>
        </div>
      </header>

      <DashboardNav />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Saudação */}
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Bem-vindo de volta</p>
          <h1 className="text-2xl font-bold text-[#13244f]">
            Olá, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Código do cliente: {profile?.client_code}</p>
        </div>

        {!hasTreatment ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-[#13244f]/10 rounded-full flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#13244f" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[#13244f] font-medium">Você ainda não tem um tratamento ativo.</p>
            <Link href="/quiz" className="inline-block bg-[#f4001e] text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-[#a30000] transition">
              Começar protocolo personalizado
            </Link>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Status do pedido */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Status do pedido</p>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${getPatientOrderStatusColor(orderStatus)}`}>
                  {orderStatus}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeItems?.map(item => (
                  <span key={item.products?.name} className="text-xs bg-[#13244f]/5 text-[#13244f] font-medium px-3 py-1 rounded-full border border-[#13244f]/10">
                    {item.products?.name}
                  </span>
                ))}
              </div>
              <Link href="/dashboard/protocolo" className="inline-block mt-4 text-sm text-[#f4001e] font-semibold hover:underline">
                Ver detalhes do protocolo →
              </Link>
            </div>

            {/* Pedidos recentes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-4">Pedidos recentes</p>
              {!orders || orders.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum pedido ainda.</p>
              ) : (
                <div className="space-y-3">
                  {orders.map(order => (
                    <div key={order.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                      <span className="font-semibold text-[#13244f]">R$ {order.total_amount?.toFixed(2).replace('.', ',')}</span>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/dashboard/pedidos" className="inline-block mt-4 text-sm text-[#f4001e] font-semibold hover:underline">
                Ver todos os pedidos →
              </Link>
            </div>

            {/* Acesso rápido ao conteúdo */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/dashboard/dieta" className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2 transition ${hasDiet ? 'hover:border-[#13244f]/30' : 'opacity-50 pointer-events-none'}`}>
                <span className="text-lg">🥗</span>
                <p className="text-sm font-bold text-[#13244f]">Minha Dieta</p>
                <p className="text-xs text-gray-400">{hasDiet ? 'Disponível' : 'Plano anual'}</p>
              </Link>
              <Link href="/dashboard/guia" className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2 transition ${hasGuide ? 'hover:border-[#13244f]/30' : 'opacity-50 pointer-events-none'}`}>
                <span className="text-lg">📖</span>
                <p className="text-sm font-bold text-[#13244f]">Guia Digital</p>
                <p className="text-xs text-gray-400">{hasGuide ? 'Disponível' : 'Compra necessária'}</p>
              </Link>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}
