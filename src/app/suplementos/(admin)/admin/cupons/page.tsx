import { redirect } from 'next/navigation'
import { CuponsClient } from '@/components/admin/CuponsClient'
import { getUserProfile } from '@/lib/auth/profile'
import { asNumber, getSql } from '@/lib/db'
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

  const profile = await getUserProfile(user.id)

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const sql = getSql()
  const couponRows = await sql<
    {
      id: string
      code: string
      type: 'percentage' | 'fixed'
      value: string | number
      expires_at: string | Date | null
      max_uses: number | null
      used_count: number
      is_active: boolean
    }[]
  >`
    SELECT id, code, type, value, expires_at, max_uses, used_count, is_active
    FROM discount_coupons
    ORDER BY created_at DESC
  `

  const coupons: Coupon[] = couponRows.map((c) => ({
    ...c,
    value: asNumber(c.value),
    expires_at:
      c.expires_at instanceof Date
        ? c.expires_at.toISOString()
        : c.expires_at,
  }))

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
          {coupons.length} cupons
        </span>
      </div>

      <CuponsClient coupons={coupons} />
    </main>
  )
}
