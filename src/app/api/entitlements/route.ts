import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ entitlements: [] }, { status: 401 })
    }

    const sql = getSql()
    const entitlements = await sql<
      {
        product_key: string
        status: string
        expires_at: string | Date | null
        is_permanent: boolean
      }[]
    >`
      SELECT product_key, status, expires_at, is_permanent
      FROM user_entitlements
      WHERE user_id = ${user.id}::uuid AND status = 'active'
    `

    return NextResponse.json({ entitlements })
  } catch (error) {
    console.error('Entitlements error:', error)
    return NextResponse.json({ entitlements: [] })
  }
}
