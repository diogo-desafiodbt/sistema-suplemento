import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

type OrderItem = {
  quantity: number
  unit_price: number
  products: { name: string } | null
}

type Order = {
  id: string
  status: string
  created_at: string
  tracking_code: string | null
  total_amount: number
  order_items: OrderItem[]
}

function getOrderMessage(status: string, trackingCode: string | null): string {
  if (status === 'delivered') return 'Entregue'
  if (status === 'dispatched' && trackingCode) return 'A caminho'
  return 'Em preparação'
}

function getOrderMessageColor(message: string): string {
  if (message === 'Entregue') return 'bg-green-100 text-green-800'
  if (message === 'A caminho') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-700'
}

export default async function PedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: orders } = await admin
    .from('orders')
    .select(`
      id, status, created_at, tracking_code, total_amount,
      order_items (
        quantity, unit_price,
        products ( name )
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const orderList = (orders ?? []) as unknown as Order[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
        <h1 className="font-semibold">Meus pedidos</h1>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-4">
        {orderList.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            Nenhum pedido ainda. Seu primeiro pedido será gerado após a confirmação do pagamento.
          </div>
        ) : (
          orderList.map(order => {
            const message = getOrderMessage(order.status, order.tracking_code)

            return (
              <div key={order.id} className="bg-white rounded-lg border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                  </span>
                  <Badge className={`${getOrderMessageColor(message)} border-0 text-xs`}>
                    {message}
                  </Badge>
                </div>

                {order.order_items?.map(item => (
                  <div key={item.products?.name} className="flex justify-between text-sm">
                    <span>{item.products?.name}</span>
                    <span className="text-gray-500">R$ {item.unit_price?.toFixed(2).replace('.', ',')}</span>
                  </div>
                ))}

                {message === 'A caminho' && order.tracking_code && (
                  <div className="bg-blue-50 rounded p-3 text-sm">
                    <p className="text-blue-700 font-medium">Código de rastreio</p>
                    <p className="text-blue-600 font-mono mt-0.5">{order.tracking_code}</p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}
