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

  const resultado = await entrar(parsed.data.email, parsed.data.password)

  // Senha certa, falta o segundo fator. A sessão do desafio volta para a tela,
  // que pede o código de seis dígitos. Ela vale poucos minutos e não dá acesso
  // a nada sozinha.
  if (resultado.tipo === 'mfa' || resultado.tipo === 'cadastrar_mfa') {
    return NextResponse.json({
      mfa: resultado.tipo === 'mfa' ? 'codigo' : 'cadastrar',
      sessao: resultado.sessao,
      usuario: resultado.usuario,
    })
  }

  if (resultado.tipo !== 'ok') {
    return NextResponse.json(
      { error: 'Email ou senha incorretos' },
      { status: 401 },
    )
  }

  const tokens = resultado.tokens
  const response = NextResponse.json({ ok: true })
  gravarTokens(response, tokens)

  // Síncrono, antes de devolver: sem vínculo o dashboard manda de volta ao
  // login. Falha não derruba quem já está vinculado.
  await pedirVinculoNoNucleo(tokens.idToken)

  return response
}
