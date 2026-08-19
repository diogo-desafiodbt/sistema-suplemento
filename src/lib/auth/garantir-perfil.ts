import { getSql } from '@/lib/db'

export async function garantirPerfil(params: {
  id: string
  email: string
  fullName: string | null
}): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO users (id, email, full_name, client_code)
    VALUES (
      ${params.id}::uuid,
      ${params.email},
      ${params.fullName},
      'DD-' || lpad(nextval('public.client_code_seq')::text, 6, '0')
    )
    ON CONFLICT (id) DO NOTHING
  `
}
