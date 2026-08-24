import { getSql } from '@/lib/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { decidir } from '@/lib/support/decide'
import { passouTetoRespostasAutomaticas } from '@/lib/support/higiene'
import { identifySupportUser } from '@/lib/support/identify'
import { investigar } from '@/lib/support/investigate'
import { verificarSaida } from '@/lib/support/saida'
import { responderTecnico } from '@/lib/support/tecnico'
import { aplicarTravas } from '@/lib/support/travas'
import { montarTranscricao, triarConversa } from '@/lib/support/triage'
import { inngest } from '../client'

/**
 * Entrega 2: triagem → investigação → decisão → travas.
 * NÃO envia e-mail. Só grava rascunho e decisão para o Pedro.
 */
export const supportAnalyze = inngest.createFunction(
  {
    id: 'support-analyze',
    name: 'Suporte — triagem, investigação e decisão',
    triggers: [{ event: 'suporte/email-recebido' }],
  },
  async ({ event }) => {
    const jobId = await registrarInicio('support_analyze')
    try {
      const threadId = (event.data as { thread_id?: string }).thread_id
      if (!threadId) {
        throw new Error('Evento suporte/email-recebido sem thread_id')
      }

      const sql = getSql()

      const threadRows = await sql<
        {
          id: string
          from_email: string
          user_id: string | null
          status: string
          respostas_automaticas_ia: number | null
        }[]
      >`
        SELECT id, from_email, user_id, status, respostas_automaticas_ia
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

      const nomeRows = userId
        ? await sql<{ full_name: string | null }[]>`
            SELECT full_name FROM users WHERE id = ${userId}::uuid LIMIT 1
          `
        : []
      const nomeCliente = nomeRows[0]?.full_name ?? null

      const tetoAutomatico = await passouTetoRespostasAutomaticas(
        thread.from_email,
      )

      const transcricao = montarTranscricao(messages)
      let triagem = null
      let triagemFalhou = false
      try {
        triagem = await triarConversa(transcricao)
      } catch (error) {
        triagemFalhou = true
        console.error('Falha na triagem de suporte:', error)
      }

      if (!triagem) {
        await sql`
          UPDATE support_threads
          SET
            triagem_ia = NULL,
            decisao_ia = NULL,
            suggested_reply = NULL,
            status = 'aguardando_revisao'::support_thread_status,
            enviado_automaticamente = false
          WHERE id = ${threadId}::uuid
        `
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 1,
          payload: {
            thread_id: threadId,
            status: 'aguardando_revisao',
            triagem_falhou: true,
            skipped: 'triagem_vazia_ou_falhou',
            teto_automatico: tetoAutomatico,
          },
        })
        return { ok: true, skipped: 'triagem_vazia_ou_falhou' }
      }

      await sql`
        UPDATE support_threads
        SET triagem_ia = ${sql.json(triagem as never)}
        WHERE id = ${threadId}::uuid
      `

      // Pedro já assumiu: a conversa é dele até encerrar.
      if (
        thread.status === 'com_suporte' ||
        thread.status === 'respondido' ||
        thread.status === 'encerrada'
      ) {
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 1,
          payload: {
            thread_id: threadId,
            triagem: triagem.categoria,
            skipped: 'humano_no_comando',
            status: thread.status,
          },
        })
        return { ok: true, skipped: 'humano_no_comando' }
      }

      // ——— Categoria técnico: modelo fixo, sem Parte C ———
      if (triagem.categoria === 'tecnico') {
        const tecnico = await responderTecnico({
          threadId,
          userId,
          pergunta: triagem.pergunta_resumida,
          nomeCliente,
        })
        const decisaoTecnica = {
          pode_resolver_sozinho: true,
          motivo_escalonamento: null as string | null,
          resposta: tecnico.texto,
          dados_usados: ['buscar_conteudo'],
          video_sugerido:
            tecnico.comAula && tecnico.titulo && tecnico.url
              ? { titulo: tecnico.titulo, url: tecnico.url }
              : null,
          origem: 'modelo_fixo_tecnico',
        }
        await sql`
          UPDATE support_threads
          SET
            decisao_ia = ${sql.json(decisaoTecnica as never)},
            suggested_reply = ${tecnico.texto},
            status = 'aguardando_revisao'::support_thread_status,
            enviado_automaticamente = false
          WHERE id = ${threadId}::uuid
        `
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 1,
          payload: {
            thread_id: threadId,
            status: 'aguardando_revisao',
            triagem: 'tecnico',
            com_aula: tecnico.comAula,
            enviado_automaticamente: false,
            teto_automatico: tetoAutomatico,
          },
        })
        return { ok: true, status: 'aguardando_revisao', triagem: 'tecnico' }
      }

      // Sem cliente identificado não há ferramenta segura.
      if (!userId) {
        await sql`
          UPDATE support_threads
          SET
            decisao_ia = NULL,
            suggested_reply = NULL,
            status = 'aguardando_revisao'::support_thread_status,
            enviado_automaticamente = false
          WHERE id = ${threadId}::uuid
        `
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 1,
          payload: {
            thread_id: threadId,
            status: 'aguardando_revisao',
            triagem: triagem.categoria,
            skipped: 'sem_user_id',
            teto_automatico: tetoAutomatico,
          },
        })
        return { ok: true, skipped: 'sem_user_id' }
      }

      if (tetoAutomatico) {
        await sql`
          UPDATE support_threads
          SET
            status = 'aguardando_revisao'::support_thread_status,
            enviado_automaticamente = false
          WHERE id = ${threadId}::uuid
        `
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 1,
          payload: {
            thread_id: threadId,
            status: 'aguardando_revisao',
            triagem: triagem.categoria,
            skipped: 'teto_respostas_automaticas',
            teto_automatico: true,
          },
        })
        return { ok: true, skipped: 'teto_respostas_automaticas' }
      }

      const acessoDesde = new Date()
      let investigacao = null
      try {
        investigacao = await investigar({
          triagem,
          userId,
          threadId,
        })
      } catch (error) {
        console.error('Falha na investigação de suporte:', error)
      }

      if (!investigacao) {
        await sql`
          UPDATE support_threads
          SET
            decisao_ia = NULL,
            suggested_reply = NULL,
            status = 'aguardando_revisao'::support_thread_status,
            enviado_automaticamente = false
          WHERE id = ${threadId}::uuid
        `
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 1,
          payload: {
            thread_id: threadId,
            status: 'aguardando_revisao',
            triagem: triagem.categoria,
            skipped: 'investigacao_falhou',
          },
        })
        return { ok: true, skipped: 'investigacao_falhou' }
      }

      let decisao = null
      try {
        decisao = await decidir({ triagem, investigacao })
      } catch (error) {
        console.error('Falha na decisão de suporte:', error)
      }

      if (!decisao) {
        await sql`
          UPDATE support_threads
          SET
            decisao_ia = NULL,
            suggested_reply = NULL,
            status = 'aguardando_revisao'::support_thread_status,
            enviado_automaticamente = false
          WHERE id = ${threadId}::uuid
        `
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 1,
          payload: {
            thread_id: threadId,
            status: 'aguardando_revisao',
            triagem: triagem.categoria,
            skipped: 'decisao_falhou',
            investigacao_truncada: investigacao.truncada,
          },
        })
        return { ok: true, skipped: 'decisao_falhou' }
      }

      const verificacaoSaida = await verificarSaida(decisao.resposta)
      const travas = await aplicarTravas({
        threadId,
        userId,
        triagem,
        decisao,
        investigacaoTruncada: investigacao.truncada,
        respostasAutomaticasIa: thread.respostas_automaticas_ia ?? 0,
        acessoDesde,
        verificacaoSaida,
      })

      const decisaoGravada = {
        ...travas.decisao,
        travas_liberadas: travas.liberado,
        motivos_travas: travas.motivos,
      }

      await sql`
        UPDATE support_threads
        SET
          decisao_ia = ${sql.json(decisaoGravada as never)},
          suggested_reply = ${travas.decisao.resposta},
          status = 'aguardando_revisao'::support_thread_status,
          enviado_automaticamente = false
        WHERE id = ${threadId}::uuid
      `

      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 1,
        payload: {
          thread_id: threadId,
          status: 'aguardando_revisao',
          triagem: triagem.categoria,
          travas_liberadas: travas.liberado,
          motivos_travas: travas.motivos,
          investigacao_truncada: investigacao.truncada,
          enviado_automaticamente: false,
          // Trabalho feito: decisão e rascunho gravados. Sem `skipped`.
        },
      })

      return {
        ok: true,
        status: 'aguardando_revisao',
        triagem: triagem.categoria,
        travas_liberadas: travas.liberado,
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
