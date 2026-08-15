import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

type ProductRow = {
  id: string
  name: string
  price_monthly: number
  price_quarterly: number
  price_yearly: number
  is_fixed: boolean
  is_active: boolean
}

export async function GET() {
  try {
    const sql = getSql()
    const products = await sql<ProductRow[]>`
      SELECT
        id,
        name,
        price_monthly::float8 AS price_monthly,
        price_quarterly::float8 AS price_quarterly,
        price_yearly::float8 AS price_yearly,
        is_fixed,
        is_active
      FROM products
      WHERE is_active = true
      ORDER BY is_fixed DESC
    `

    return NextResponse.json({ products })
  } catch {
    return NextResponse.json({ products: [] })
  }
}
