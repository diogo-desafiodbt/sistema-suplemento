'use server'

import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'

export async function fetchCheckoutProfile(): Promise<{
  full_name: string | null
  email: string | null
} | null> {
  const sessao = await sessaoAtual()
  if (!sessao) return null

  const sql = getSql()
  const rows = await sql<{ full_name: string | null; email: string | null }[]>`
    SELECT full_name, email FROM users
    WHERE id = ${sessao.userId}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}
