import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/admin/AdminNav'
import { PedidosActions } from '@/components/admin/PedidosActions'

type OrderRow = {
  id: string
  status: string
  created_at: string
  tracking_code: string | null
  total_amount: number
  shipping_request_id: string | null
  users: {
    full_name: string
    email: string
    client_code: string
  } | null
}

export default async function AdminPedidosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: orders } = await admin
    .from('orders')
    .select(`
      id, status, created_at, tracking_code, total_amount, shipping_request_id,
      users ( full_name, email, client_code )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const orderList = (orders ?? []) as unknown as OrderRow[]

  return (
    <div className="min-h-screen bg-[#f5f0eb]">

      <header className="bg-[#13244f] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <img src="/logo-branca.png" alt="Desafio Diabetes" className="h-7 w-auto" />
          <span className="text-white/40 text-sm">Admin</span>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-white/60 hover:text-white transition">Sair</button>
        </form>
      </header>

      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <AdminNav active="pedidos" />
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Operações</p>
            <h1 className="text-2xl font-bold text-[#13244f]">Pedidos</h1>
          </div>
          <span className="text-sm text-gray-400">{orderList.length} registros</span>
        </div>

        <PedidosActions orders={orderList} />
      </main>
    </div>
  )
}
