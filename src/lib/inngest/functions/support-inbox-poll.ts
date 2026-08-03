import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeMessageId } from '@/lib/support/message-id'

function imapConfigured(): boolean {
  return Boolean(
    process.env.SUPPORT_IMAP_HOST &&
      process.env.SUPPORT_IMAP_USER &&
      process.env.SUPPORT_IMAP_PASSWORD
  )
}

async function resolveThreadId(params: {
  messageId: string
  inReplyTo: string | null
  references: string[]
  fromEmail: string
  subject: string | null
}): Promise<string> {
  const admin = createAdminClient()

  const candidates = [
    params.inReplyTo,
    ...params.references,
  ]
    .map((id) => normalizeMessageId(id))
    .filter((id): id is string => Boolean(id))

  for (const candidate of candidates) {
    const { data: existing } = await admin
      .from('support_messages')
      .select('thread_id')
      .eq('message_id', candidate)
      .maybeSingle()
    if (existing?.thread_id) return existing.thread_id
  }

  const { data: thread, error } = await admin
    .from('support_threads')
    .insert({
      thread_key: params.messageId,
      from_email: params.fromEmail,
      subject: params.subject,
      status: 'novo',
    })
    .select('id')
    .single()

  if (error || !thread) {
    // Race: outra execução já criou a thread com o mesmo thread_key
    if (error?.code === '23505') {
      const { data: again } = await admin
        .from('support_threads')
        .select('id')
        .eq('thread_key', params.messageId)
        .maybeSingle()
      if (again?.id) return again.id
    }
    throw error ?? new Error('Falha ao criar support_threads')
  }

  return thread.id
}

export const supportInboxPoll = inngest.createFunction(
  {
    id: 'support-inbox-poll',
    name: 'Suporte — ler caixa IMAP',
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async () => {
    if (!imapConfigured()) {
      console.warn('SUPPORT_IMAP_* ausente — poll de suporte ignorado')
      return { ok: true, skipped: 'missing_imap_env' }
    }

    const admin = createAdminClient()
    const client = new ImapFlow({
      host: process.env.SUPPORT_IMAP_HOST!,
      port: Number(process.env.SUPPORT_IMAP_PORT ?? 993),
      secure: true,
      auth: {
        user: process.env.SUPPORT_IMAP_USER!,
        pass: process.env.SUPPORT_IMAP_PASSWORD!,
      },
      logger: false,
    })

    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    let processed = 0

    try {
      for await (const message of client.fetch(
        { seen: false },
        { uid: true, source: true }
      )) {
        if (!message.source) continue

        const parsed = await simpleParser(message.source)
        const messageId = normalizeMessageId(parsed.messageId)
        if (!messageId) {
          console.error('E-mail sem Message-ID — pulando uid', message.uid)
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true })
          continue
        }

        const { data: already } = await admin
          .from('support_messages')
          .select('id')
          .eq('message_id', messageId)
          .maybeSingle()

        if (already) {
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true })
          continue
        }

        const fromAddress = Array.isArray(parsed.from)
          ? parsed.from[0]
          : parsed.from
        const fromEmail =
          fromAddress?.value?.[0]?.address?.toLowerCase() ??
          'desconhecido@invalid'

        const inReplyTo = normalizeMessageId(
          typeof parsed.inReplyTo === 'string'
            ? parsed.inReplyTo
            : Array.isArray(parsed.inReplyTo)
              ? parsed.inReplyTo[0]
              : null
        )

        const referencesRaw = parsed.references
        const references = (
          Array.isArray(referencesRaw)
            ? referencesRaw
            : typeof referencesRaw === 'string'
              ? referencesRaw.split(/\s+/)
              : []
        )
          .map((r) => normalizeMessageId(r))
          .filter((r): r is string => Boolean(r))

        const threadId = await resolveThreadId({
          messageId,
          inReplyTo,
          references,
          fromEmail,
          subject: parsed.subject ?? null,
        })

        const toAddress = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to
        const htmlBody =
          typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : null

        const { error: insertError } = await admin.from('support_messages').insert({
          thread_id: threadId,
          direction: 'inbound',
          message_id: messageId,
          in_reply_to: inReplyTo,
          from_email: fromEmail,
          to_email:
            toAddress?.value?.[0]?.address?.toLowerCase() ??
            process.env.SUPPORT_IMAP_USER ??
            null,
          body_text: parsed.text ?? htmlBody,
        })

        if (insertError) {
          if (insertError.code !== '23505') {
            console.error('Erro ao inserir support_messages:', insertError)
          }
        } else {
          await admin
            .from('support_threads')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', threadId)

          await inngest.send({
            name: 'suporte/email-recebido',
            data: { thread_id: threadId },
          })
          processed += 1
        }

        await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true })
      }
    } finally {
      lock.release()
      await client.logout()
    }

    return { ok: true, processed }
  }
)
