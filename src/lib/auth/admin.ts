// Quem esta logado, em UMA ida ao banco.
//
// Antes o admin perguntava quatro vezes por navegacao: o layout chamava
// `sessaoAtual()` e `getUserProfile()` em serie, e sete das treze telas
// repetiam as duas por dentro. Quatro consultas a `users` para ler quatro
// campos da mesma linha.
//
// `cache()` do React vale por requisicao: layout e pagina chamam a vontade e
// o banco e consultado uma vez so.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { COOKIE_ID } from '@/lib/auth/cookies'
import { verificarIdToken } from '@/lib/auth/verificador-jwt'
import { getSql } from '@/lib/db'

export type Admin = {
  userId: string
  email: string | null
  fullName: string | null
  role: string
  clientCode: string | null
}

type Linha = {
  id: string
  email: string | null
  full_name: string | null
  role: string
  client_code: string | null
}

/** Sessao + perfil numa consulta. `null` se nao ha sessao valida. */
export const usuarioAtual = cache(
  async function usuarioAtual(): Promise<Admin | null> {
    const cookieStore = await cookies()
    const idToken = cookieStore.get(COOKIE_ID)?.value
    if (!idToken) return null

    let sub: string
    let emailToken: string | null
    try {
      const payload = await verificarIdToken(idToken)
      sub = payload.sub
      emailToken = typeof payload.email === 'string' ? payload.email : null
    } catch {
      return null
    }

    const sql = getSql()
    const rows = await sql<Linha[]>`
    SELECT id, email, full_name, role, client_code
    FROM users
    WHERE cognito_sub = ${sub}
    LIMIT 1
  `
    const u = rows[0]
    if (!u) return null

    return {
      userId: u.id,
      email: u.email ?? emailToken,
      fullName: u.full_name,
      role: u.role,
      clientCode: u.client_code,
    }
  },
)

/**
 * Exige admin. Redireciona quem nao e, do mesmo jeito que as telas ja faziam.
 * O layout e cada tela podem chamar sem custo: a consulta e a mesma.
 */
export async function exigirAdmin(): Promise<Admin> {
  const u = await usuarioAtual()
  if (!u) redirect('/suplementos/login')
  if (u.role !== 'admin') redirect('/suplementos/dashboard')
  return u
}
