import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  criarUsuario,
  EmailJaCadastradoError,
  entrar,
} from '@/lib/auth/cognito'
import { gravarTokens } from '@/lib/auth/cookies'
import { pedirVinculoNoNucleo } from '@/lib/contrato/vincular'

// A regra é do Cognito, não escolha nossa: dez caracteres, com letra
// minúscula e número. Está escrita aqui e na tela, com as mesmas palavras —
// duas cópias que discordam é como a tela chegou a pedir seis enquanto o
// Cognito exigia dez.
export const REGRA_DA_SENHA =
  'A senha precisa ter pelo menos 10 caracteres, com letra minúscula e número.'

const schema = z.object({
  email: z.string().email('E-mail inválido.'),
  password: z
    .string()
    .min(10, REGRA_DA_SENHA)
    .regex(/[a-z]/, REGRA_DA_SENHA)
    .regex(/[0-9]/, REGRA_DA_SENHA),
  full_name: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // Devolve o motivo, não a palavra "inválido": quem está preenchendo um
    // formulário precisa saber qual campo consertar.
    const motivo = parsed.error.issues[0]?.message ?? 'Dados inválidos'
    return NextResponse.json({ error: motivo }, { status: 400 })
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
    // O Cognito recusa senha fraca com o motivo em inglês e no formato dele.
    // Engolir isso num "Erro ao criar conta" faz a pessoa tentar de novo com a
    // mesma senha, porque nada indicou o que estava errado.
    if (
      error instanceof Error &&
      error.name === 'InvalidPasswordException'
    ) {
      return NextResponse.json({ error: REGRA_DA_SENHA }, { status: 400 })
    }
    console.error('cadastrar error:', error)
    return NextResponse.json({ error: 'Erro ao criar conta' }, { status: 500 })
  }
}
