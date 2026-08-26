import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { COOKIE_ID } from '@/lib/auth/cookies'
import { garantirPerfilCognito } from '@/lib/auth/garantir-perfil'
import { verificarIdToken } from '@/lib/auth/verificador-jwt'

/**
 * Vincula o `cognito_sub` na linha de `users` (adota por e-mail se ainda
 * estiver nulo). Roda no núcleo (`app_web`) — `app_entrada` não pode
 * escrever `cognito_sub`.
 *
 * Nada vem do body: o cookie `dd_id` é a única fonte.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies()
  const idToken = cookieStore.get(COOKIE_ID)?.value
  if (!idToken) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let sub: string
  let email: string
  try {
    const payload = await verificarIdToken(idToken)
    sub = payload.sub
    if (typeof payload.email !== 'string' || !payload.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    email = payload.email
    // Sem e-mail verificado, quem inventasse conta Cognito com o e-mail de
    // um cliente existente adotaria a linha desse cliente.
    if (payload.email_verified !== true) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // O nome vem do corpo porque no cadastro ele existe e ainda não está em
  // lugar nenhum — descartá-lo faria a pessoa se cadastrar com nome e a linha
  // ficar sem. Não é credencial, e `garantirPerfilCognito` só preenche nome
  // que esteja nulo, na linha do e-mail deste token verificado.
  let fullName: string | null = null
  try {
    const corpo = (await request.json()) as { full_name?: unknown }
    if (typeof corpo?.full_name === 'string' && corpo.full_name.trim()) {
      fullName = corpo.full_name.trim()
    }
  } catch {
    // corpo vazio é o caso do login, e é normal
  }

  try {
    await garantirPerfilCognito({
      cognitoSub: sub,
      email,
      fullName,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('contrato/auth/vincular:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
