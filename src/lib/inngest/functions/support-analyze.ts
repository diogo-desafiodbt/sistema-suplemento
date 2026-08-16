import { claimByFlag, releaseFlag } from '@/lib/idempotency'
import { getSql } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifySupportThread, draftSupportReply } from '@/lib/support/ai'
import { fetchSupportFacts, hasRelevantFacts } from '@/lib/support/facts'
import { identifySupportUser } from '@/lib/support/identify'
import { getThreadReplyHeaders, sendSupportEmail } from '@/lib/support/mailer'
import { inngest } from '../client'

const AUTO_ACK_BODY = `Olá! Recebemos sua mensagem e nossa equipe já vai analisar. Pra agilizar e garantir que encontramos seu cadastro certinho, pode confirmar seu CPF e o e-mail usado na compra, por favor?

Equipe Desafio Diabetes`

export const supportAnalyze = inngest.createFunction(
  {
    id: 'support-analyze',
    name: 'Suporte — aviso automático e análise',
    triggers: [{ event: 'suporte/email-recebido' }],
  },
  async ({ event }) => {
    const threadId = (event.data as { thread_id?: string }).thread_id
    if (!threadId)
      throw new Error('Evento suporte/email-recebido sem thread_id')

    const sql = getSql()
    const admin = createAdminClient()

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
      admin,
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
          admin,
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
      userId = await identifySupportUser({
        fromEmail: thread.from_email,
        bodyTexts: inboundBodies,
      })
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

    return { ok: true, status: 'aguardando_revisao', category }
  },
)
