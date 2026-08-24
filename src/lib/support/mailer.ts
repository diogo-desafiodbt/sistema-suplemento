import nodemailer from 'nodemailer'
import { getSql } from '@/lib/db'
import { normalizeMessageId, wrapMessageId } from '@/lib/support/message-id'
import { aplicarRodape } from '@/lib/support/rodape'

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
  const sql = getSql()

  const threadRows = await sql<{ subject: string | null }[]>`
    SELECT subject FROM support_threads
    WHERE id = ${params.threadId}::uuid
    LIMIT 1
  `
  const thread = threadRows[0] ?? null

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
  const bodyText = aplicarRodape(params.bodyText)

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
    text: bodyText,
    headers: {
      'Auto-Submitted': 'auto-replied',
      'X-Auto-Response-Suppress': 'All',
    },
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

  await sql`
    INSERT INTO support_messages (
      thread_id, direction, message_id, in_reply_to, from_email, to_email, body_text
    )
    VALUES (
      ${params.threadId}::uuid,
      'outbound',
      ${outboundId},
      ${normalizeMessageId(params.inReplyToMessageId)},
      ${smtp.user},
      ${params.toEmail},
      ${bodyText}
    )
  `

  await sql`
    UPDATE support_threads
    SET last_message_at = ${new Date().toISOString()}
    WHERE id = ${params.threadId}::uuid
  `
}

/** Cabeçalhos de thread a partir da última inbound (+ histórico de message_ids). */
export async function getThreadReplyHeaders(threadId: string): Promise<{
  inReplyToMessageId?: string
  referencesMessageIds: string[]
}> {
  const sql = getSql()
  const messages = await sql<
    { message_id: string | null; direction: string; created_at: string | Date }[]
  >`
    SELECT message_id, direction, created_at
    FROM support_messages
    WHERE thread_id = ${threadId}::uuid
    ORDER BY created_at ASC
  `

  const allIds = messages
    .map((m) => normalizeMessageId(m.message_id))
    .filter((id): id is string => Boolean(id))

  const lastInbound = [...messages]
    .reverse()
    .find((m) => m.direction === 'inbound')

  return {
    inReplyToMessageId:
      normalizeMessageId(lastInbound?.message_id) ?? undefined,
    referencesMessageIds: allIds,
  }
}
