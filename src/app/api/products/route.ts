import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const admin = createAdminClient()
    const { data: products, error } = await admin
      .from('products')
      .select('id, name, price_monthly, price_quarterly, price_yearly, is_fixed, is_active')
      .eq('is_active', true)
      .order('is_fixed', { ascending: false })

    if (error) {
      return NextResponse.json({ products: [] })
    }

    return NextResponse.json({ products })
  } catch {
    return NextResponse.json({ products: [] })
  }
}
