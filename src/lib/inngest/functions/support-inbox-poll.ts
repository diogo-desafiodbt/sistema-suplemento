import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import postgres from 'postgres'
import { getSql } from '@/lib/db'
import { claimOnce, markClaimCompleted, releaseClaim } from '@/lib/idempotency'
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
  const sql = getSql()

  const candidates = [params.inReplyTo, ...params.references]
    .map((id) => normalizeMessageId(id))
    .filter((id): id is string => Boolean(id))

  for (const candidate of candidates) {
    const existing = await sql<{ thread_id: string }[]>`
      SELECT thread_id FROM support_messages
      WHERE message_id = ${candidate}
      LIMIT 1
    `
    if (existing[0]?.thread_id) return existing[0].thread_id
  }

  try {
    const threadRows = await sql<{ id: string }[]>`
      INSERT INTO support_threads (thread_key, from_email, subject, status)
      VALUES (${params.messageId}, ${params.fromEmail}, ${params.subject}, 'novo')
      RETURNING id
    `
    const thread = threadRows[0]
    if (!thread) throw new Error('Falha ao criar support_threads')
    return thread.id
  } catch (error) {
    if (error instanceof postgres.PostgresError && error.code === '23505') {
      const again = await sql<{ id: string }[]>`
        SELECT id FROM support_threads
        WHERE thread_key = ${params.messageId}
        LIMIT 1
      `
      if (again[0]?.id) return again[0].id
    }
    throw error
  }
}

export const supportInboxPoll = inngest.createFunction(
  {
    id: 'support-inbox-poll',
    name: 'Suporte — ler caixa IMAP',
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async () => {
    const imapHost = process.env.SUPPORT_IMAP_HOST
    const imapUser = process.env.SUPPORT_IMAP_USER
    const imapPassword = process.env.SUPPORT_IMAP_PASSWORD

    if (!imapConfigured() || !imapHost || !imapUser || !imapPassword) {
      console.warn('SUPPORT_IMAP_* ausente — poll de suporte ignorado')
      return { ok: true, skipped: 'missing_imap_env' }
    }

    const sql = getSql()
    const client = new ImapFlow({
      host: imapHost,
      port: Number(process.env.SUPPORT_IMAP_PORT ?? 993),
      secure: true,
      auth: {
        user: imapUser,
        pass: imapPassword,
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

        const alreadyRows = await sql<
          { id: string; completed_at: string | Date | null }[]
        >`
          SELECT id, completed_at FROM support_messages
          WHERE message_id = ${messageId}
          LIMIT 1
        `
        const already = alreadyRows[0] ?? null

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
            await sql`
              UPDATE support_threads
              SET last_message_at = ${new Date().toISOString()}
              WHERE id = ${threadId}::uuid
            `

            await inngest.send({
              name: 'suporte/email-recebido',
              data: { thread_id: threadId },
            })
            eventSent = true
            // Evidência antes do stamp — heal stale não reenvia nem dropa.
            try {
              await sql`
                UPDATE support_messages
                SET event_dispatched_at = ${new Date().toISOString()}
                WHERE message_id = ${messageId}
              `
            } catch (dispatchedError) {
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
          const existingRows = await sql<
            {
              completed_at: string | Date | null
              event_dispatched_at: string | Date | null
              created_at: string | Date
            }[]
          >`
            SELECT completed_at, event_dispatched_at, created_at
            FROM support_messages
            WHERE message_id = ${messageId}
            LIMIT 1
          `
          const existing = existingRows[0] ?? null
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
              await sql`
                UPDATE support_messages
                SET event_dispatched_at = ${new Date().toISOString()}
                WHERE message_id = ${messageId}
              `

              await markClaimCompleted(
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
      try {
        await client.logout()
      } catch (logoutError) {
        // A conexão já pode ter morrido (socket timeout do IMAP). O trabalho
        // desta run já terminou; encerrar mal não deve reprovar a run.
        console.warn('support-inbox-poll: logout do IMAP falhou:', logoutError)
      }
    }

    return { ok: true, processed }
  },
)
