import { NextResponse } from 'next/server'
import { z } from 'zod'
import { esqueciSenha } from '@/lib/auth/cognito'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: true })
  }

  await esqueciSenha(parsed.data.email)
  return NextResponse.json({ ok: true })
}
