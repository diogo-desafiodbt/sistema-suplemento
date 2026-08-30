import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  criarUsuario,
  EmailJaCadastradoError,
  entrar,
} from '@/lib/auth/cognito'
import { gravarTokens } from '@/lib/auth/cookies'
import { pedirVinculoNoNucleo } from '@/lib/contrato/vincular'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  full_name: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { email, password, full_name: fullName } = parsed.data

  try {
    // Cognito primeiro. O vínculo em users.cognito_sub só o núcleo (app_web)
    // pode escrever — passa por /api/contrato/auth/vincular depois do login.
    await criarUsuario(email, password)

    // Quem acabou de se cadastrar é paciente, e MFA vale só para admin — mas
    // se um dia o desafio aparecer aqui, é melhor mandar para o login do que
    // dizer "erro ao entrar" sem explicação.
    const resultado = await entrar(email, password)
    if (resultado.tipo !== 'ok') {
      return NextResponse.json(
        { ok: true, precisaEntrar: true },
        { status: 200 },
      )
    }

    const tokens = resultado.tokens
    const response = NextResponse.json({ ok: true })
    gravarTokens(response, tokens)
    await pedirVinculoNoNucleo(tokens.idToken, fullName ?? null)
    return response
  } catch (error) {
    if (error instanceof EmailJaCadastradoError) {
      return NextResponse.json(
        {
          error:
            'Este email já está cadastrado. Faça login ou use outro email.',
        },
        { status: 409 },
      )
    }
    console.error('cadastrar error:', error)
    return NextResponse.json({ error: 'Erro ao criar conta' }, { status: 500 })
  }
}
