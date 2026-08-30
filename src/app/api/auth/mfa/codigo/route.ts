// Segundo passo do login: o código de seis dígitos do autenticador.
//
// A sessão do desafio vem da resposta de `/api/auth/entrar`, vale poucos
// minutos e não dá acesso a nada sozinha — é só a prova de que a senha já foi
// aceita.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { responderMfa } from '@/lib/auth/cognito'
import { gravarTokens } from '@/lib/auth/cookies'
import { pedirVinculoNoNucleo } from '@/lib/contrato/vincular'

const schema = z.object({
  usuario: z.string().min(1),
  sessao: z.string().min(1),
  codigo: z.string().regex(/^\d{6}$/, 'O código tem seis dígitos'),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
  }

  const tokens = await responderMfa(
    parsed.data.usuario,
    parsed.data.sessao,
    parsed.data.codigo,
  )
  if (!tokens) {
    // Código errado e sessão expirada são a mesma mensagem de propósito: dizer
    // qual dos dois foi ajuda mais quem está tentando adivinhar que quem errou.
    return NextResponse.json(
      { error: 'Código incorreto ou expirado. Entre de novo.' },
      { status: 401 },
    )
  }

  const response = NextResponse.json({ ok: true })
  gravarTokens(response, tokens)
  await pedirVinculoNoNucleo(tokens.idToken)
  return response
}
