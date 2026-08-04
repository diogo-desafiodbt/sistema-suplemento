import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { identifySupportUser } from '@/lib/support/identify'
import {
  fetchSupportFacts,
  hasRelevantFacts,
} from '@/lib/support/facts'
import { classifySupportThread, draftSupportReply } from '@/lib/support/ai'
import {
  getThreadReplyHeaders,
  sendSupportEmail,
} from '@/lib/support/mailer'
import { claimByFlag, releaseFlag } from '@/lib/idempotency'

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
    if (!threadId) throw new Error('Evento suporte/email-recebido sem thread_id')

    const admin = createAdminClient()

    const { data: thread } = await admin
      .from('support_threads')
      .select(
        'id, from_email, subject, user_id, auto_ack_sent_at, status'
      )
      .eq('id', threadId)
      .maybeSingle()

    if (!thread) {
      throw new Error(`Thread de suporte não encontrada: ${threadId}`)
    }

    // 4.1 — Aviso automático genérico (uma vez por thread, claim permanente)
    const claimed = await claimByFlag(
      admin,
      'support_threads',
      threadId,
      'auto_ack_sent_at',
      false
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
        await releaseFlag(admin, 'support_threads', threadId, 'auto_ack_sent_at')
      }
    }

    const { data: messages } = await admin
      .from('support_messages')
      .select('direction, body_text, from_email, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

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
        await admin
          .from('support_threads')
          .update({ user_id: userId })
          .eq('id', threadId)
      }
    }

    if (!userId) {
      await admin
        .from('support_threads')
        .update({
          status: 'aguardando_dados',
          db_facts: null,
          suggested_reply: null,
        })
        .eq('id', threadId)
      return { ok: true, status: 'aguardando_dados' }
    }

    const threadText = (messages ?? [])
      .map(
        (m) =>
          `[${m.direction}] ${m.from_email ?? ''}\n${m.body_text ?? ''}`.trim()
      )
      .join('\n\n---\n\n')

    // 4.3 — Classificação + fatos
    const category = await classifySupportThread(threadText)
    const facts = await fetchSupportFacts(userId, category)

    const { data: user } = await admin
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()

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

    await admin
      .from('support_threads')
      .update({
        status: 'aguardando_revisao',
        db_facts: facts,
        suggested_reply: suggested,
      })
      .eq('id', threadId)

    return { ok: true, status: 'aguardando_revisao', category }
  }
)
