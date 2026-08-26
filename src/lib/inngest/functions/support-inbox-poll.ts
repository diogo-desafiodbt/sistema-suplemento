import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import postgres from 'postgres'
import { getSql } from '@/lib/db'
import { claimOnce, markClaimCompleted, releaseClaim } from '@/lib/idempotency'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import {
  eAutomaticoDeclarado,
  eRemetenteSistema,
} from '@/lib/support/higiene'
import { normalizeMessageId } from '@/lib/support/message-id'
import { inngest } from '../client'

const IMAP_UID_KEY = 'support_imap_last_uid'

function uidNextDaCaixa(
  mailbox: { uidNext: number } | false | undefined | null,
): number {
  if (!mailbox) return 1
  return mailbox.uidNext ?? 1
}

function imapConfigured(): boolean {
  return Boolean(
    process.env.SUPPORT_IMAP_HOST &&
      process.env.SUPPORT_IMAP_USER &&
      process.env.SUPPORT_IMAP_PASSWORD,
  )
}

function lerCabecalho(parsed: ParsedMail, nome: string): string | null {
  const valor = parsed.headers?.get(nome)
  if (valor == null) return null
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor)) {
    const primeiro = valor[0]
    return primeiro == null ? null : String(primeiro)
  }
  return String(valor)
}

async function lerUltimoUid(): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ value: string }[]>`
    SELECT value FROM system_config WHERE key = ${IMAP_UID_KEY} LIMIT 1
  `
  const n = Number.parseInt(rows[0]?.value ?? '0', 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

async function gravarUltimoUid(uid: number): Promise<void> {
  const sql = getSql()
  const valor = String(uid)
  const updated = await sql`
    UPDATE system_config SET value = ${valor} WHERE key = ${IMAP_UID_KEY}
  `
  if (updated.count === 0) {
    await sql`
      INSERT INTO system_config (key, value, description)
      VALUES (
        ${IMAP_UID_KEY},
        ${valor},
        ${'Maior UID IMAP já processado pelo poll de suporte'}
      )
    `
  }
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

  const aberta = await sql<{ id: string }[]>`
    SELECT id FROM support_threads
    WHERE lower(from_email) = ${params.fromEmail}
      AND status::text NOT IN ('encerrada', 'respondido')
    ORDER BY last_message_at DESC
    LIMIT 1
  `
  if (aberta[0]?.id) return aberta[0].id

  try {
    const threadRows = await sql<{ id: string }[]>`
      INSERT INTO support_threads (thread_key, from_email, subject, status)
      VALUES (${params.messageId}, ${params.fromEmail}, ${params.subject}, 'nova')
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
    const jobId = await registrarInicio('support_inbox_poll')
    try {
    const imapHost = process.env.SUPPORT_IMAP_HOST
    const imapUser = process.env.SUPPORT_IMAP_USER
    const imapPassword = process.env.SUPPORT_IMAP_PASSWORD

    if (!imapConfigured() || !imapHost || !imapUser || !imapPassword) {
      console.warn('SUPPORT_IMAP_* ausente — poll de suporte ignorado')
      await registrarFim(jobId, { status: 'completed', affectedRows: 0 })
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
    let maxUid = await lerUltimoUid()
    const primeiraVez = maxUid === 0

    try {
      const uidNext = uidNextDaCaixa(client.mailbox)
      if (!primeiraVez && maxUid + 1 >= uidNext) {
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
        })
        return { ok: true, processed: 0 }
      }

      const range = primeiraVez
        ? { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        : `${maxUid + 1}:*`
      const fetchOpts = primeiraVez ? undefined : { uid: true }

      const uidInicial = maxUid
      for await (const message of client.fetch(
        range,
        { uid: true, source: true },
        fetchOpts,
      )) {
        if (message.uid > maxUid) maxUid = message.uid

        if (!message.source) continue

        const parsed = await simpleParser(message.source)
        const autoSubmitted = lerCabecalho(parsed, 'auto-submitted')
        if (eAutomaticoDeclarado(autoSubmitted)) continue

        const fromAddress = Array.isArray(parsed.from)
          ? parsed.from[0]
          : parsed.from
        const fromEmail =
          fromAddress?.value?.[0]?.address?.toLowerCase() ??
          'desconhecido@invalid'

        if (eRemetenteSistema(fromEmail)) continue

        const messageId = normalizeMessageId(parsed.messageId)
        if (!messageId) {
          console.error('E-mail sem Message-ID — pulando uid', message.uid)
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

        if (already?.completed_at) continue

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
              // NUNCA apagar: aqui a "reserva" é a mensagem do cliente, não
              // uma linha de controle. Sem isto o mecanismo usaria o prazo
              // padrão e removeria e-mail que tivesse ficado sem processar —
              // apagando o que o cliente escreveu para não repetir trabalho.
              //
              // Até 26/08/2026 quem impedia isso era a permissão negada no
              // banco, por acidente. Proteção que depende de acidente não é
              // proteção.
              staleAfterMs: false,
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
            if (stamped) processed += 1
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
            continue
          }
          if (existing) {
            try {
              const ageMs = existing.created_at
                ? Date.now() - new Date(existing.created_at).getTime()
                : Number.POSITIVE_INFINITY

              if (ageMs < 2 * 60 * 1000) {
                continue
              }

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
            } catch (healError) {
              console.error(
                'support-inbox-poll: falha ao curar mensagem parcial:',
                healError,
              )
            }
          }
        }
      }

      if (maxUid > uidInicial) {
        await gravarUltimoUid(maxUid)
      } else if (primeiraVez) {
        const uidNextApos = uidNextDaCaixa(client.mailbox)
        if (uidNextApos > 1) await gravarUltimoUid(uidNextApos - 1)
      }
    } finally {
      lock.release()
      try {
        await client.logout()
      } catch (logoutError) {
        console.warn('support-inbox-poll: logout do IMAP falhou:', logoutError)
      }
    }

    await registrarFim(jobId, {
      status: 'completed',
      affectedRows: processed,
    })
    return { ok: true, processed }
    } catch (error) {
      await registrarFim(jobId, {
        status: 'failed',
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  },
)
