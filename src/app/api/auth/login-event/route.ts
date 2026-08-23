import { NextResponse } from 'next/server'
import { garantirPerfil } from '@/lib/auth/garantir-perfil'
import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'

export async function POST(request: Request) {
  let userId: string | undefined
  try {
    const sessao = await sessaoAtual()

    if (!sessao) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    userId = sessao.userId
    await garantirPerfil({
      id: sessao.userId,
      email: sessao.email ?? '',
      fullName: null,
    })

    const sql = getSql()
    await sql`
      INSERT INTO user_login_history (user_id, ip_address, user_agent, logged_at)
      VALUES (
        ${sessao.userId}::uuid,
        ${request.headers.get('x-forwarded-for') ?? 'unknown'},
        ${request.headers.get('user-agent') ?? 'unknown'},
        ${new Date().toISOString()}
      )
    `

    await sql`
      UPDATE users
      SET rfm_recalc_queued_at = ${new Date().toISOString()}
      WHERE id = ${sessao.userId}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Login event error:', {
      userId,
      message: error instanceof Error ? error.message : String(error),
      error,
    })
    return NextResponse.json({ ok: true })
  }
}
