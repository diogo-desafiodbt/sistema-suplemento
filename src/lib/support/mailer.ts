import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeMessageId, wrapMessageId } from '@/lib/support/message-id'

function requireSmtpEnv(): {
  host: string
  port: number
  user: string
  pass: string
} {
  const host = process.env.SUPPORT_SMTP_HOST
  const user = process.env.SUPPORT_SMTP_USER
  const pass = process.env.SUPPORT_SMTP_PASSWORD
  if (!host || !user || !pass) {
    throw new Error('SUPPORT_SMTP_* não configurado')
  }
  return {
    host,
    port: Number(process.env.SUPPORT_SMTP_PORT ?? 465),
    user,
    pass,
  }
}

export async function sendSupportEmail(params: {
  threadId: string
  toEmail: string
  subject: string
  bodyText: string
  inReplyToMessageId?: string
  referencesMessageIds: string[]
  /** false = assunto puro (aviso automático de abertura); default true se houver In-Reply-To */
  useReplySubject?: boolean
}): Promise<void> {
  const smtp = requireSmtpEnv()
  const admin = createAdminClient()

  const { data: thread } = await admin
    .from('support_threads')
    .select('subject')
    .eq('id', params.threadId)
    .maybeSingle()

  const originalSubject =
    thread?.subject?.trim() || params.subject.trim() || 'Suporte'
  const useReplySubject =
    params.useReplySubject ?? Boolean(params.inReplyToMessageId)
  const subject = useReplySubject
    ? originalSubject.toLowerCase().startsWith('re:')
      ? originalSubject
      : `Re: ${originalSubject}`
    : originalSubject

  const references = [
    ...params.referencesMessageIds,
    ...(params.inReplyToMessageId ? [params.inReplyToMessageId] : []),
  ]
    .map((id) => normalizeMessageId(id))
    .filter((id): id is string => Boolean(id))

  const uniqueRefs = Array.from(new Set(references))

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  })

  const info = await transporter.sendMail({
    from: `Desafio Diabetes <${smtp.user}>`,
    to: params.toEmail,
    subject,
    text: params.bodyText,
    inReplyTo: params.inReplyToMessageId
      ? wrapMessageId(params.inReplyToMessageId)
      : undefined,
    references:
      uniqueRefs.length > 0
        ? uniqueRefs.map(wrapMessageId).join(' ')
        : undefined,
  })

  const outboundId =
    normalizeMessageId(info.messageId) ??
    `outbound-${params.threadId}-${Date.now()}@desafiodiabetes.com`

  await admin.from('support_messages').insert({
    thread_id: params.threadId,
    direction: 'outbound',
    message_id: outboundId,
    in_reply_to: normalizeMessageId(params.inReplyToMessageId),
    from_email: smtp.user,
    to_email: params.toEmail,
    body_text: params.bodyText,
  })

  await admin
    .from('support_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', params.threadId)
}

/** Cabeçalhos de thread a partir da última inbound (+ histórico de message_ids). */
export async function getThreadReplyHeaders(threadId: string): Promise<{
  inReplyToMessageId?: string
  referencesMessageIds: string[]
}> {
  const admin = createAdminClient()
  const { data: messages } = await admin
    .from('support_messages')
    .select('message_id, direction, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  const allIds = (messages ?? [])
    .map((m) => normalizeMessageId(m.message_id))
    .filter((id): id is string => Boolean(id))

  const lastInbound = [...(messages ?? [])]
    .reverse()
    .find((m) => m.direction === 'inbound')

  return {
    inReplyToMessageId:
      normalizeMessageId(lastInbound?.message_id) ?? undefined,
    referencesMessageIds: allIds,
  }
}
