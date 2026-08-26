import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { sessaoAtual } from '@/lib/auth/sessao'
import { getSql } from '@/lib/db'
import { getThreadReplyHeaders, sendSupportEmail } from '@/lib/support/mailer'
import { registrarVeredito } from '@/lib/support/veredito'

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
    const body = (await request.json()) as {
      body_text?: string
      veredito?: 'aprovada' | 'rejeitada'
      segundos?: number
    }
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
        suggested_reply: string | null
        categoria: string | null
        origem: string | null
      }[]
    >`
      SELECT id, from_email, subject, status, suggested_reply,
             triagem_ia->>'categoria' AS categoria,
             decisao_ia->>'origem' AS origem
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

    if (thread.status === 'encerrada' || thread.status === 'respondido') {
      return NextResponse.json(
        { error: 'Conversa encerrada' },
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

    // NÃO sobrescrever suggested_reply com o texto do Pedro. O rascunho da IA
    // é metade da comparação do modo sombra: "das conversas em que as travas
    // liberaram, quantas vezes ele mandou o texto da IA sem mexer?". O que ele
    // enviou já está em support_messages como 'outbound', gravado dentro do
    // mailer — a comparação é entre os dois. Sobrescrever apaga o lado da IA.
    // Registra o julgamento antes de mexer na conversa. É o que transforma o
    // modo sombra em número: sem isto, medir se a IA está pronta exigiria ler
    // conversa por conversa e opinar.
    //
    // Falhar aqui não pode impedir o Pedro de atender: o e-mail já saiu.
    if (thread.suggested_reply && body.veredito) {
      try {
        await registrarVeredito({
          threadId: id,
          veredito: body.veredito,
          sugestao: thread.suggested_reply,
          enviado: bodyText,
          segundos:
            typeof body.segundos === 'number' && body.segundos >= 0
              ? Math.round(body.segundos)
              : null,
          categoria: thread.categoria,
          origem: thread.origem,
          decididoPor: auth.userId,
        })
      } catch (erro) {
        console.error('Falha ao registrar veredito da sugestão:', erro)
      }
    }

    await sql`
      UPDATE support_threads
      SET
        status = 'com_suporte',
        reviewed_by = ${auth.userId}::uuid
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
