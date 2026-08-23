import { NextResponse } from 'next/server'
import { z } from 'zod'
import { confirmarNovaSenha } from '@/lib/auth/cognito'

const schema = z.object({
  email: z.string().email(),
  codigo: z.string().min(1),
  senha: z
    .string()
    .min(10)
    .regex(/[a-z]/, 'Precisa de letra minúscula')
    .regex(/\d/, 'Precisa de número'),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
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
