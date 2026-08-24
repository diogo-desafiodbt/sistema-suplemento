import { getSql } from '@/lib/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { passouTetoRespostasAutomaticas } from '@/lib/support/higiene'
import { identifySupportUser } from '@/lib/support/identify'
import { montarTranscricao, triarConversa } from '@/lib/support/triage'
import { inngest } from '../client'

export const supportAnalyze = inngest.createFunction(
  {
    id: 'support-analyze',
    name: 'Suporte — triagem em quarentena',
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
        user_id: string | null
        status: string
      }[]
    >`
      SELECT id, from_email, user_id, status
      FROM support_threads
      WHERE id = ${threadId}::uuid
      LIMIT 1
    `
    const thread = threadRows[0] ?? null

    if (!thread) {
      throw new Error(`Thread de suporte não encontrada: ${threadId}`)
    }

    const messages = await sql<
      {
        direction: string
        body_text: string | null
      }[]
    >`
      SELECT direction, body_text
      FROM support_messages
      WHERE thread_id = ${threadId}::uuid
      ORDER BY created_at ASC
    `

    let userId = thread.user_id
    if (!userId) {
      userId = await identifySupportUser(thread.from_email)
      if (userId) {
        await sql`
          UPDATE support_threads SET user_id = ${userId}::uuid
          WHERE id = ${threadId}::uuid
        `
      }
    }

    const transcricao = montarTranscricao(messages)
    const tetoAutomatico = await passouTetoRespostasAutomaticas(
      thread.from_email,
    )
    let triagem = null
    let triagemFalhou = false
    try {
      triagem = await triarConversa(transcricao)
    } catch (error) {
      triagemFalhou = true
      console.error('Falha na triagem de suporte:', error)
    }

    const statusAtual = thread.status
    const deveFicarNova =
      statusAtual === 'nova' ||
      statusAtual === 'novo' ||
      statusAtual === 'aguardando_dados'

    await sql`
      UPDATE support_threads
      SET
        triagem_ia = ${triagem ? sql.json(triagem as never) : null},
        status = ${deveFicarNova ? 'nova' : statusAtual}::support_thread_status
      WHERE id = ${threadId}::uuid
    `

    await registrarFim(jobId, {
      status: 'completed',
      affectedRows: 1,
      payload: {
        thread_id: threadId,
        status: deveFicarNova ? 'nova' : statusAtual,
        triagem: triagem?.categoria ?? null,
        // Sem isto a conversa cai sem classificação e o job fica verde.
        triagem_falhou: triagemFalhou,
        teto_automatico: tetoAutomatico,
      },
    })
    return {
      ok: true,
      status: deveFicarNova ? 'nova' : statusAtual,
      triagem: triagem?.categoria ?? null,
    }
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
