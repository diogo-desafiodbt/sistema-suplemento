import { redirect } from 'next/navigation'
import { CuponsClient } from '@/components/admin/CuponsClient'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const { data: coupons } = await admin
    .from('discount_coupons')
    .select(
      'id, code, type, value, expires_at, max_uses, used_count, is_active',
    )
    .order('created_at', { ascending: false })

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
            Marketing
          </p>
          <h1 className="text-2xl font-bold text-[#13244f]">
            Cupons de desconto
          </h1>
        </div>
        <span className="text-sm text-gray-400">
          {(coupons ?? []).length} cupons
        </span>
      </div>

      <CuponsClient coupons={(coupons ?? []) as Coupon[]} />
    </main>
  )
}
