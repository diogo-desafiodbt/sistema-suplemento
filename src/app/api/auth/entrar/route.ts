import { NextResponse } from 'next/server'
import { z } from 'zod'
import { entrar } from '@/lib/auth/cognito'
import { gravarTokens } from '@/lib/auth/cookies'

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
  return response
}
