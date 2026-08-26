import { NextResponse } from 'next/server'
import { z } from 'zod'
import { entrar } from '@/lib/auth/cognito'
import { gravarTokens } from '@/lib/auth/cookies'
import { pedirVinculoNoNucleo } from '@/lib/contrato/vincular'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Email ou senha incorretos' },
      { status: 401 },
    )
  }

  const tokens = await entrar(parsed.data.email, parsed.data.password)
  if (!tokens) {
    return NextResponse.json(
      { error: 'Email ou senha incorretos' },
      { status: 401 },
    )
  }

  const response = NextResponse.json({ ok: true })
  gravarTokens(response, tokens)

  // Síncrono, antes de devolver: sem vínculo o dashboard manda de volta ao
  // login. Falha não derruba quem já está vinculado.
  await pedirVinculoNoNucleo(tokens.idToken)

  return response
}
