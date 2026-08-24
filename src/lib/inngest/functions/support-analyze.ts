import { claimByFlag, releaseFlag } from '@/lib/idempotency'
import { getSql } from '@/lib/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { classifySupportThread, draftSupportReply } from '@/lib/support/ai'
import { fetchSupportFacts, hasRelevantFacts } from '@/lib/support/facts'
import { identifySupportUser } from '@/lib/support/identify'
import { getThreadReplyHeaders, sendSupportEmail } from '@/lib/support/mailer'
import { inngest } from '../client'

const AUTO_ACK_BODY = `Olá! Recebemos sua mensagem e nossa equipe já vai analisar. Se você escreveu de um endereço diferente do que usou na compra, responda deste mesmo e-mail contando qual foi — assim encontramos seu cadastro.

Equipe Desafio Diabetes`

export const supportAnalyze = inngest.createFunction(
  {
    id: 'support-analyze',
    name: 'Suporte — aviso automático e análise',
    triggers: [{ event: 'suporte/email-recebido' }],
  },
  async ({ event }) => {
    const jobId = await registrarInicio('support_analyze')
    try {
    const threadId = (event.data as { thread_id?: string }).thread_id
    if (!threadId)
      throw new Error('Evento suporte/email-recebido sem thread_id')

    const sql = getSql()

    const threadRows = await sql<
      {
        id: string
        from_email: string
        subject: string | null
        user_id: string | null
        auto_ack_sent_at: string | Date | null
        status: string
      }[]
    >`
      SELECT id, from_email, subject, user_id, auto_ack_sent_at, status
      FROM support_threads
      WHERE id = ${threadId}::uuid
      LIMIT 1
    `
    const thread = threadRows[0] ?? null

    if (!thread) {
      throw new Error(`Thread de suporte não encontrada: ${threadId}`)
    }

    // 4.1 — Aviso automático genérico (uma vez por thread, claim permanente)
    const claimed = await claimByFlag(
      'support_threads',
      threadId,
      'auto_ack_sent_at',
      false,
    )

    if (claimed) {
      try {
        const headers = await getThreadReplyHeaders(threadId)
        await sendSupportEmail({
          threadId,
          toEmail: thread.from_email,
          subject: thread.subject ?? 'Suporte Desafio Diabetes',
          bodyText: AUTO_ACK_BODY,
          inReplyToMessageId: headers.inReplyToMessageId,
          referencesMessageIds: headers.referencesMessageIds,
          useReplySubject: false,
        })
      } catch (error) {
        console.error('Falha ao enviar auto-ack de suporte:', error)
        await releaseFlag(
          'support_threads',
          threadId,
          'auto_ack_sent_at',
        )
      }
    }

    const messages = await sql<
      {
        direction: string
        body_text: string | null
        from_email: string | null
        created_at: string | Date
      }[]
    >`
      SELECT direction, body_text, from_email, created_at
      FROM support_messages
      WHERE thread_id = ${threadId}::uuid
      ORDER BY created_at ASC
    `

    const inboundBodies = (messages ?? [])
      .filter((m) => m.direction === 'inbound')
      .map((m) => m.body_text ?? '')

    // 4.2 — Identificação
    let userId = thread.user_id
    if (!userId) {
      // Só o remetente. O corpo da mensagem é texto de estranho — usá-lo
      // para identificar deixava qualquer um se passar por outro cliente.
      userId = await identifySupportUser(thread.from_email)
      if (userId) {
        await sql`
          UPDATE support_threads SET user_id = ${userId}::uuid
          WHERE id = ${threadId}::uuid
        `
      }
    }

    if (!userId) {
      await sql`
        UPDATE support_threads
        SET status = 'aguardando_dados', db_facts = NULL, suggested_reply = NULL
        WHERE id = ${threadId}::uuid
      `
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 1,
        payload: { thread_id: threadId, status: 'aguardando_dados' },
      })
      return { ok: true, status: 'aguardando_dados' }
    }

    const threadText = (messages ?? [])
      .map((m) =>
        `[${m.direction}] ${m.from_email ?? ''}\n${m.body_text ?? ''}`.trim(),
      )
      .join('\n\n---\n\n')

    // 4.3 — Classificação + fatos
    const category = await classifySupportThread(threadText)
    const facts = await fetchSupportFacts(userId, category)

    const userRows = await sql<{ full_name: string | null }[]>`
      SELECT full_name FROM users WHERE id = ${userId}::uuid LIMIT 1
    `
    const user = userRows[0] ?? null

    // 4.4 — Sugestão
    let suggested: string | null = null
    if (hasRelevantFacts(facts)) {
      try {
        suggested = await draftSupportReply({
          threadText,
          facts,
          customerName: user?.full_name,
        })
      } catch (error) {
        console.error('Falha ao redigir sugestão de suporte:', error)
      }
    }

    await sql`
      UPDATE support_threads
      SET
        status = 'aguardando_revisao',
        db_facts = ${sql.json(facts as never)},
        suggested_reply = ${suggested}
      WHERE id = ${threadId}::uuid
    `

    await registrarFim(jobId, {
      status: 'completed',
      affectedRows: 1,
      payload: { thread_id: threadId, status: 'aguardando_revisao' },
    })
    return { ok: true, status: 'aguardando_revisao', category }
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
