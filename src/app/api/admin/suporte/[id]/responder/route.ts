import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'
import { getThreadReplyHeaders, sendSupportEmail } from '@/lib/support/mailer'

async function requireAdmin() {
  const sessao = await sessaoAtual()
  if (!sessao) return null

  const profile = await getUserProfile(sessao.userId)
  if (profile?.role !== 'admin') return null
  return { userId: sessao.userId }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin()
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await context.params
    const body = (await request.json()) as { body_text?: string }
    const bodyText = body.body_text?.trim()
    if (!bodyText) {
      return NextResponse.json(
        { error: 'Texto da resposta obrigatório' },
        { status: 400 },
      )
    }

    const sql = getSql()
    const threadRows = await sql<
      {
        id: string
        from_email: string
        subject: string | null
        status: string
      }[]
    >`
      SELECT id, from_email, subject, status
      FROM support_threads
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    const thread = threadRows[0] ?? null

    if (!thread) {
      return NextResponse.json(
        { error: 'Thread não encontrada' },
        { status: 404 },
      )
    }

    if (thread.status === 'respondido') {
      return NextResponse.json(
        { error: 'Thread já respondida' },
        { status: 400 },
      )
    }

    const headers = await getThreadReplyHeaders(id)
    await sendSupportEmail({
      threadId: id,
      toEmail: thread.from_email,
      subject: thread.subject ?? 'Suporte Desafio Diabetes',
      bodyText,
      inReplyToMessageId: headers.inReplyToMessageId,
      referencesMessageIds: headers.referencesMessageIds,
      useReplySubject: true,
    })

    await sql`
      UPDATE support_threads
      SET
        status = 'respondido',
        reviewed_by = ${auth.userId}::uuid,
        suggested_reply = ${bodyText}
      WHERE id = ${id}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('admin suporte responder error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
