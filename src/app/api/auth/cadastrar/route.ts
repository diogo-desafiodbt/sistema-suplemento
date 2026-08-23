import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  criarUsuario,
  EmailJaCadastradoError,
  entrar,
} from '@/lib/auth/cognito'
import { gravarTokens } from '@/lib/auth/cookies'
import { garantirPerfilCognito } from '@/lib/auth/garantir-perfil'

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
    const sub = await criarUsuario(email, password)
    await garantirPerfilCognito({
      cognitoSub: sub,
      email,
      fullName: fullName ?? null,
    })

    const tokens = await entrar(email, password)
    if (!tokens) {
      return NextResponse.json({ error: 'Erro ao entrar' }, { status: 500 })
    }

    const response = NextResponse.json({ ok: true })
    gravarTokens(response, tokens)
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
