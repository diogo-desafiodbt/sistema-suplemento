import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { AssinaturaClient } from '@/components/patient/AssinaturaClient'

export default async function AssinaturaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: subscription } = await admin
    .from('subscriptions')
    .select('id, plan_type, status, expires_at, grace_period_ends_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: payments } = await admin
    .from('payments')
    .select('amount, status, paid_at')
    .eq('subscription_id', subscription?.id ?? '')
    .order('paid_at', { ascending: false })
    .limit(5)

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
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Sua assinatura</p>
          <h1 className="text-2xl font-bold text-[#13244f]">Minha Assinatura</h1>
        </div>

        <AssinaturaClient
          subscription={subscription}
          payments={payments ?? []}
        />
      </main>
    </div>
  )
}
