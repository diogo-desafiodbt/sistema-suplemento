import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'
import { getThreadReplyHeaders, sendSupportEmail } from '@/lib/support/mailer'

const MENSAGEM_ENCERRAMENTO = `Estamos encerrando este atendimento. Se precisar de algo mais, responda este e-mail ou escreva de novo — abrimos uma conversa nova para você.

Equipe Desafio Diabetes`

async function requireAdmin() {
  const sessao = await sessaoAtual()
  if (!sessao) return null

  const profile = await getUserProfile(sessao.userId)
  if (profile?.role !== 'admin') return null
  return { userId: sessao.userId }
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin()
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await context.params
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

    if (thread.status === 'encerrada') {
      return NextResponse.json(
        { error: 'Conversa já encerrada' },
        { status: 400 },
      )
    }

    const headers = await getThreadReplyHeaders(id)
    await sendSupportEmail({
      threadId: id,
      toEmail: thread.from_email,
      subject: thread.subject ?? 'Suporte Desafio Diabetes',
      bodyText: MENSAGEM_ENCERRAMENTO,
      inReplyToMessageId: headers.inReplyToMessageId,
      referencesMessageIds: headers.referencesMessageIds,
      useReplySubject: true,
    })

    // Não mexe em suggested_reply — o rascunho da IA fica para o modo sombra.
    await sql`
      UPDATE support_threads
      SET
        status = 'encerrada'::support_thread_status,
        reviewed_by = ${auth.userId}::uuid
      WHERE id = ${id}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('admin suporte encerrar error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 },
    )
  }
}
