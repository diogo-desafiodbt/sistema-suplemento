import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { garantirPerfil } from '@/lib/auth/garantir-perfil'
import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'
import { COOKIE_VISITANTE, costurar, registrar } from '@/lib/rastro/registrar'

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

    // O único momento em que o identificador do navegador e o da pessoa estão
    // na mesma requisição. É aqui, e só aqui, que a jornada anterior ao login
    // ganha dono — sem isto, quem vê um vídeo hoje e compra amanhã aparece
    // como duas pessoas e o vídeo nunca recebe crédito pela venda.
    const anonimoId = (await cookies()).get(COOKIE_VISITANTE)?.value
    if (anonimoId) {
      await costurar(anonimoId, sessao.userId)
      await registrar(anonimoId, 'login', sessao.userId)
    }

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
