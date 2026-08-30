// Cadastro do aplicativo autenticador, para quem já está logado.
//
// GET  devolve o segredo, que a tela transforma em QR Code.
// POST confirma com o primeiro código e liga o TOTP para a pessoa.
//
// Fica atrás de sessão: só cadastra autenticador quem já entrou.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { COOKIE_ACCESS } from '@/lib/auth/cookies'
import { comecarCadastroMfa, confirmarCadastroMfa } from '@/lib/auth/cognito'
import { usuarioAtual } from '@/lib/auth/admin'

async function tokenDeAcesso(): Promise<string | null> {
  const store = await cookies()
  return store.get(COOKIE_ACCESS)?.value ?? null
}

export async function GET() {
  const usuario = await usuarioAtual()
  if (!usuario) return NextResponse.json({ error: 'sem sessão' }, { status: 401 })

  const token = await tokenDeAcesso()
  if (!token) return NextResponse.json({ error: 'sem sessão' }, { status: 401 })

  const segredo = await comecarCadastroMfa(token)
  if (!segredo) {
    return NextResponse.json(
      { error: 'Não foi possível iniciar o cadastro do autenticador.' },
      { status: 500 },
    )
  }

  // A URL que os aplicativos de autenticação entendem.
  const rotulo = encodeURIComponent(`Desafio Diabetes:${usuario.email ?? ''}`)
  return NextResponse.json({
    segredo,
    url: `otpauth://totp/${rotulo}?secret=${segredo}&issuer=Desafio%20Diabetes`,
  })
}

export async function POST(request: Request) {
  const usuario = await usuarioAtual()
  if (!usuario) return NextResponse.json({ error: 'sem sessão' }, { status: 401 })

  const parsed = z
    .object({ codigo: z.string().regex(/^\d{6}$/) })
    .safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
  }

  const token = await tokenDeAcesso()
  if (!token) return NextResponse.json({ error: 'sem sessão' }, { status: 401 })

  const ok = await confirmarCadastroMfa(token, parsed.data.codigo)
  if (!ok) {
    return NextResponse.json(
      { error: 'Código incorreto. Tente o próximo que o aplicativo mostrar.' },
      { status: 400 },
    )
  }
  return NextResponse.json({ ok: true })
}
