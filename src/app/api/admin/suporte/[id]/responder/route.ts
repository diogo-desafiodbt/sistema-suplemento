import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getThreadReplyHeaders,
  sendSupportEmail,
} from '@/lib/support/mailer'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return { admin, userId: user.id }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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
      return NextResponse.json({ error: 'Texto da resposta obrigatório' }, { status: 400 })
    }

    const { data: thread } = await auth.admin
      .from('support_threads')
      .select('id, from_email, subject, status')
      .eq('id', id)
      .maybeSingle()

    if (!thread) {
      return NextResponse.json({ error: 'Thread não encontrada' }, { status: 404 })
    }

    if (thread.status === 'respondido') {
      return NextResponse.json({ error: 'Thread já respondida' }, { status: 400 })
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

    await auth.admin
      .from('support_threads')
      .update({
        status: 'respondido',
        reviewed_by: auth.userId,
        suggested_reply: bodyText,
      })
      .eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('admin suporte responder error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
