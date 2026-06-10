import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/admin/AdminNav'
import { CuponsClient } from '@/components/admin/CuponsClient'

type Coupon = {
  id: string
  code: string
  type: 'percentage' | 'fixed'
  value: number
  expires_at: string | null
  max_uses: number | null
  used_count: number
  is_active: boolean
}

export default async function AdminCuponsPage() {
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

  const { data: coupons } = await admin
    .from('discount_coupons')
    .select('id, code, type, value, expires_at, max_uses, used_count, is_active')
    .order('created_at', { ascending: false })

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
        <AdminNav active="cupons" />
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Marketing</p>
            <h1 className="text-2xl font-bold text-[#13244f]">Cupons de desconto</h1>
          </div>
          <span className="text-sm text-gray-400">{(coupons ?? []).length} cupons</span>
        </div>

        <CuponsClient coupons={(coupons ?? []) as Coupon[]} />
      </main>
    </div>
  )
}
