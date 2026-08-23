import { getSql } from '@/lib/db'

// `fullName` pode ser nulo, e isso é correto: no primeiro login o perfil
// precisa existir e o nome ainda não. Ele chega depois, pelo quiz ou pelo
// checkout. `users.full_name` deixou de ser NOT NULL em 23/08/2026 por causa
// disso — antes, quem entrava sem nome derrubava a criação do próprio perfil.

/** Perfil de quem já tem linha em `users` (login, checkout logado). */
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

/** Cadastro novo: cria linha com `cognito_sub` e devolve `users.id`. */
export async function garantirPerfilCognito(params: {
  cognitoSub: string
  email: string
  fullName: string | null
}): Promise<string> {
  const sql = getSql()

  const existente = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE cognito_sub = ${params.cognitoSub} LIMIT 1
  `
  if (existente[0]) return existente[0].id

  const inserido = await sql<{ id: string }[]>`
    INSERT INTO users (id, email, full_name, cognito_sub, client_code)
    VALUES (
      gen_random_uuid(),
      ${params.email},
      ${params.fullName},
      ${params.cognitoSub},
      'DD-' || lpad(nextval('public.client_code_seq')::text, 6, '0')
    )
    ON CONFLICT (cognito_sub) DO NOTHING
    RETURNING id
  `
  if (inserido[0]) return inserido[0].id

  const depois = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE cognito_sub = ${params.cognitoSub} LIMIT 1
  `
  if (!depois[0]) throw new Error('falha ao criar perfil')
  return depois[0].id
}
