import { getSql } from '@/lib/db'

// `fullName` pode ser nulo, e isso é correto: no primeiro login o perfil
// precisa existir e o nome ainda não. Ele chega depois, pelo quiz ou pelo
// checkout. `users.full_name` deixou de ser NOT NULL em 23/08/2026 por causa
// disso — antes, quem entrava sem nome derrubava a criação do próprio perfil.

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
