import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: products, error } = await supabase
      .from('products')
      .select(
        'id, name, price_monthly, price_quarterly, price_yearly, is_fixed, is_active',
      )
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
