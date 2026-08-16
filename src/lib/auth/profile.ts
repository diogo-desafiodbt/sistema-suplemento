import { getSql } from '@/lib/db'

export type UserProfile = {
  full_name: string | null
  role: string
  client_code: string | null
}

export async function getUserProfile(
  userId: string,
): Promise<UserProfile | null> {
  const sql = getSql()
  const rows = await sql<UserProfile[]>`
    SELECT full_name, role, client_code
    FROM users
    WHERE id = ${userId}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}
