import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ entitlements: [] }, { status: 401 })
    }

    const { data: entitlements, error } = await supabase
      .from('user_entitlements')
      .select('product_key, status, expires_at, is_permanent')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (entitlements) {
      return NextResponse.json({ entitlements })
    }

    if (error?.code === '42501') {
      const { data: adminEntitlements } = await createAdminClient()
        .from('user_entitlements')
        .select('product_key, status, expires_at, is_permanent')
        .eq('user_id', user.id)
        .eq('status', 'active')
      return NextResponse.json({ entitlements: adminEntitlements ?? [] })
    }

    return NextResponse.json({ entitlements: [] })
  } catch (error) {
    console.error('Entitlements error:', error)
    return NextResponse.json({ entitlements: [] })
  }
}
