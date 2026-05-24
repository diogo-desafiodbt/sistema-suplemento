import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="font-semibold">Desafio Diabetes</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{profile?.full_name}</span>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">Sair</button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">
            Olá, {profile?.full_name?.split(' ')[0]}
          </h2>
          <p className="text-gray-500 mt-1 text-sm">Código do cliente: {profile?.client_code}</p>
        </div>

        {!hasTreatment ? (
          <div className="bg-white rounded-lg border p-8 text-center space-y-4">
            <p className="text-gray-600">Você ainda não tem um tratamento ativo.</p>
            <Link href="/quiz">
              <Button>Começar protocolo personalizado</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-white rounded-lg border p-5 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Meu protocolo</h3>
                <Badge className={`${getPatientOrderStatusColor(orderStatus)} border-0`}>
                  {orderStatus}
                </Badge>
              </div>
              <div className="flex gap-2 flex-wrap">
                {activeItems?.map(item => (
                  <Badge key={item.products?.name} variant="outline">
                    {item.products?.name}
                  </Badge>
                ))}
              </div>
              <Link href="/dashboard/protocolo">
                <Button variant="outline" size="sm">Ver detalhes</Button>
              </Link>
            </div>

            <div className="bg-white rounded-lg border p-5 space-y-3">
              <h3 className="font-medium">Pedidos</h3>
              {!orders || orders.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum pedido ainda.</p>
              ) : (
                <div className="space-y-2">
                  {orders.map(order => (
                    <div key={order.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">
                        {new Date(order.created_at).toLocaleDateString('pt-BR')}
                      </span>
                      <span>
                        R$ {order.total_amount?.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/dashboard/pedidos">
                <Button variant="outline" size="sm">Ver todos</Button>
              </Link>
            </div>

            <div className="bg-white rounded-lg border p-5 space-y-3">
              <h3 className="font-medium">Conteúdo</h3>
              <div className="space-y-2">
                <Link href="/dashboard/dieta" className={`block text-sm p-2 rounded border transition-colors ${hasDiet ? 'hover:border-gray-400' : 'opacity-50 cursor-not-allowed pointer-events-none'}`}>
                  <div className="flex items-center justify-between">
                    <span>Dieta de Reversão</span>
                    {hasDiet ? <span className="text-green-600 text-xs">Disponível</span> : <span className="text-gray-400 text-xs">Plano anual</span>}
                  </div>
                </Link>
                <Link href="/dashboard/guia" className={`block text-sm p-2 rounded border transition-colors ${hasGuide ? 'hover:border-gray-400' : 'opacity-50 cursor-not-allowed pointer-events-none'}`}>
                  <div className="flex items-center justify-between">
                    <span>Guia Digital</span>
                    {hasGuide ? <span className="text-green-600 text-xs">Disponível</span> : <span className="text-gray-400 text-xs">Compra necessária</span>}
                  </div>
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
