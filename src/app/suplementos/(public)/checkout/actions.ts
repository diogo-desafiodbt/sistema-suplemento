'use server'

import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export async function fetchCheckoutProfile(): Promise<{
  full_name: string | null
  email: string | null
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const sql = getSql()
  const rows = await sql<{ full_name: string | null; email: string | null }[]>`
    SELECT full_name, email FROM users
    WHERE id = ${user.id}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}
