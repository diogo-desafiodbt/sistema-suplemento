import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { claimOnce, markClaimCompleted, releaseClaim } from '@/lib/idempotency'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeMessageId } from '@/lib/support/message-id'
import { inngest } from '../client'

function imapConfigured(): boolean {
  return Boolean(
    process.env.SUPPORT_IMAP_HOST &&
      process.env.SUPPORT_IMAP_USER &&
      process.env.SUPPORT_IMAP_PASSWORD,
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

  const candidates = [params.inReplyTo, ...params.references]
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
        { uid: true, source: true },
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
          .select('id, completed_at')
          .eq('message_id', messageId)
          .maybeSingle()

        // Só marca lida se o processamento realmente terminou.
        // Row sem completed_at = em andamento ou claim liberada — não pular.
        if (already?.completed_at) {
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
              : null,
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
          typeof parsed.html === 'string'
            ? parsed.html.replace(/<[^>]+>/g, ' ')
            : null

        const messageRow = {
          message_id: messageId,
          thread_id: threadId,
          direction: 'inbound' as const,
          in_reply_to: inReplyTo,
          from_email: fromEmail,
          to_email:
            toAddress?.value?.[0]?.address?.toLowerCase() ??
            process.env.SUPPORT_IMAP_USER ??
            null,
          body_text: parsed.text ?? htmlBody,
        }

        let won = false
        try {
          const result = await claimOnce(
            admin,
            'support_messages',
            messageRow,
            {
              completedColumn: 'completed_at',
            },
          )
          won = result.won
        } catch (insertError) {
          console.error('Erro ao inserir support_messages:', insertError)
        }

        if (won) {
          let eventSent = false
          try {
            await admin
              .from('support_threads')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', threadId)

            await inngest.send({
              name: 'suporte/email-recebido',
              data: { thread_id: threadId },
            })
            eventSent = true
            // Evidência antes do stamp — heal stale não reenvia nem dropa.
            const { error: dispatchedError } = await admin
              .from('support_messages')
              .update({ event_dispatched_at: new Date().toISOString() })
              .eq('message_id', messageId)
            if (dispatchedError) {
              console.error(
                'support-inbox-poll: falha ao gravar event_dispatched_at:',
                dispatchedError,
              )
            }
          } catch (processError) {
            console.error(
              'Erro ao processar support message após claim:',
              processError,
            )
            await releaseClaim(
              admin,
              'support_messages',
              'message_id',
              messageId,
            )
            // Não marca \\Seen — próximo poll tenta de novo.
          }

          if (eventSent) {
            let stamped = false
            for (let attempt = 0; attempt < 3 && !stamped; attempt++) {
              try {
                await markClaimCompleted(
                  admin,
                  'support_messages',
                  'message_id',
                  messageId,
                  'completed_at',
                )
                stamped = true
              } catch (completeError) {
                console.error(
                  `support-inbox-poll: falha ao marcar completed_at (tentativa ${attempt + 1}):`,
                  completeError,
                )
                if (attempt < 2) {
                  await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
                }
              }
            }
            if (stamped) {
              processed += 1
              await client.messageFlagsAdd(message.uid, ['\\Seen'], {
                uid: true,
              })
            }
          }
        } else {
          const { data: existing } = await admin
            .from('support_messages')
            .select('completed_at, event_dispatched_at, created_at')
            .eq('message_id', messageId)
            .maybeSingle()
          if (existing?.completed_at) {
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true })
          } else if (existing) {
            // Claim parcial: jovem = outro poll ativo. Stale: reenvia só se
            // ainda não há evidência de dispatch; senão só completa o stamp.
            try {
              const ageMs = existing.created_at
                ? Date.now() - new Date(existing.created_at).getTime()
                : Number.POSITIVE_INFINITY

              if (ageMs < 2 * 60 * 1000) {
                continue
              }

              // Stale: sempre reenvia. Auto-ack é idempotente; replies em
              // threads já avançadas precisam de nova análise se o Inngest
              // falhou após o dispatch.
              await inngest.send({
                name: 'suporte/email-recebido',
                data: { thread_id: threadId },
              })
              await admin
                .from('support_messages')
                .update({ event_dispatched_at: new Date().toISOString() })
                .eq('message_id', messageId)

              await markClaimCompleted(
                admin,
                'support_messages',
                'message_id',
                messageId,
                'completed_at',
              )
              await client.messageFlagsAdd(message.uid, ['\\Seen'], {
                uid: true,
              })
            } catch (healError) {
              console.error(
                'support-inbox-poll: falha ao curar mensagem parcial:',
                healError,
              )
            }
          }
        }
      }
    } finally {
      lock.release()
      await client.logout()
    }

    return { ok: true, processed }
  },
)
