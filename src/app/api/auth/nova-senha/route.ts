import { NextResponse } from 'next/server'
import { z } from 'zod'
import { confirmarNovaSenha } from '@/lib/auth/cognito'
import { REGRA_DA_SENHA } from '../cadastrar/route'

const schema = z.object({
  email: z.string().email('E-mail inválido.'),
  codigo: z.string().min(1, 'Informe o código que chegou no e-mail.'),
  senha: z
    .string()
    .min(10, REGRA_DA_SENHA)
    .regex(/[a-z]/, REGRA_DA_SENHA)
    .regex(/\d/, REGRA_DA_SENHA),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // Mesma razão do cadastro: "Dados inválidos" faz a pessoa tentar de novo
    // com a mesma senha, porque nada disse o que estava errado.
    const motivo = parsed.error.issues[0]?.message ?? 'Dados inválidos'
    return NextResponse.json({ error: motivo }, { status: 400 })
  }

  try {
    await confirmarNovaSenha(
      parsed.data.email,
      parsed.data.codigo,
      parsed.data.senha,
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('nova-senha error:', error)
    return NextResponse.json(
      { error: 'Não foi possível redefinir a senha. Verifique o código.' },
      { status: 400 },
    )
  }
}
