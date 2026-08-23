import { NextResponse } from 'next/server'
import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'

export async function GET() {
  try {
    const sessao = await sessaoAtual()

    if (!sessao) {
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
      WHERE user_id = ${sessao.userId}::uuid AND status = 'active'
    `

    return NextResponse.json({ entitlements })
  } catch (error) {
    console.error('Entitlements error:', error)
    return NextResponse.json({ entitlements: [] })
  }
}
