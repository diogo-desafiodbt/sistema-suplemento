import { NextResponse } from 'next/server'
import { garantirPerfil } from '@/lib/auth/garantir-perfil'
import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  let userId: string | undefined
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    userId = user.id
    const metaName = user.user_metadata?.full_name
    await garantirPerfil({
      id: user.id,
      email: user.email ?? '',
      fullName: typeof metaName === 'string' ? metaName : null,
    })

    const sql = getSql()
    await sql`
      INSERT INTO user_login_history (user_id, ip_address, user_agent, logged_at)
      VALUES (
        ${user.id}::uuid,
        ${request.headers.get('x-forwarded-for') ?? 'unknown'},
        ${request.headers.get('user-agent') ?? 'unknown'},
        ${new Date().toISOString()}
      )
    `

    await sql`
      UPDATE users
      SET rfm_recalc_queued_at = ${new Date().toISOString()}
      WHERE id = ${user.id}::uuid
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
