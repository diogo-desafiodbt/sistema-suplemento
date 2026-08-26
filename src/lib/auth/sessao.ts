// Ponto único de leitura de sessão — Cognito por baixo, users.id por cima.
// Quem precisar saber quem está logado importa daqui; o resto do sistema
// não fica sabendo quando o motor trocar de novo.

import { cookies } from 'next/headers'
import { COOKIE_ID } from '@/lib/auth/cookies'
import { verificarIdToken } from '@/lib/auth/verificador-jwt'
import { getSql } from '@/lib/db'

export type Sessao = { userId: string; email: string | null }

/**
 * Só verifica o JWT e devolve o `sub`. Sem banco.
 * Usado pelo middleware no portal (MODO_PORTAL), que não tem DATABASE_URL.
 */
export async function subDoIdTokenVerificado(
  idToken: string,
): Promise<string | null> {
  try {
    const payload = await verificarIdToken(idToken)
    return payload.sub
  } catch {
    return null
  }
}

/** Quem está logado nesta requisição, ou null. Precisa de DATABASE_URL (núcleo). */
export async function sessaoAtual(): Promise<Sessao | null> {
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
  const rows = await sql<{ id: string; email: string | null }[]>`
    SELECT id, email FROM users WHERE cognito_sub = ${sub} LIMIT 1
  `
  const user = rows[0]
  if (!user) return null

  return {
    userId: user.id,
    email: user.email ?? emailToken,
  }
}

/** Traduz id token → users.id. Precisa de DATABASE_URL (núcleo). */
export async function userIdDoToken(idToken: string): Promise<string | null> {
  const sub = await subDoIdTokenVerificado(idToken)
  if (!sub) return null

  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE cognito_sub = ${sub} LIMIT 1
  `
  return rows[0]?.id ?? null
}
