import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { getSql } from '@/lib/db'
import { recebiveisDaCobranca } from '@/lib/pagarme/recebiveis'
import { inngest } from '../client'

/**
 * Guarda a previsão de recebimento assim que a compra é confirmada.
 *
 * Antes disto o sistema sabia que a venda foi aprovada e não sabia quando o
 * dinheiro entra. Uma venda parcelada em seis é seis entradas em seis meses,
 * cada uma menor que a parcela por causa da taxa — e a diferença entre o valor
 * vendido e o valor recebido não aparecia em lugar nenhum.
 *
 * Idempotente pelo id do recebível: reler a agenda atualiza a linha. É por
 * esse mesmo caminho que a mudança de "previsto" para "pago" vai chegar, na
 * etapa seguinte.
 */
export const pagarmeRecebiveisSync = inngest.createFunction(
  {
    id: 'pagarme-recebiveis-sync',
    name: 'Previsão de recebimento no Pagar.me',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event, step }) => {
    const jobId = await registrarInicio('pagarme_recebiveis_sync')
    try {
      const { payment_id } = event.data as { payment_id?: string }
      if (!payment_id) {
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
          payload: { pulado: 'evento-sem-payment_id' },
        })
        return { pulado: 'evento-sem-payment_id' }
      }

      const sql = getSql()
      const [pagamento] = await sql<{ pagarme_charge_id: string | null }[]>`
        SELECT pagarme_charge_id FROM payments WHERE id = ${payment_id}::uuid
      `

      // Assinatura recorrente grava um id de ciclo, não de cobrança. A API de
      // recebíveis só entende cobrança — pedir com o outro devolveria vazio e
      // pareceria "sem recebível" em vez de "pergunta errada".
      const chargeId = pagamento?.pagarme_charge_id
      if (!chargeId || !chargeId.startsWith('ch_')) {
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
          payload: { payment_id, pulado: 'sem-charge_id' },
        })
        return { pulado: 'sem-charge_id' }
      }

      // Passo próprio: a agenda pode não existir no instante da aprovação, e
      // o Inngest repete só esta parte se ela falhar.
      const recebiveis = await step.run('consultar-pagarme', () =>
        recebiveisDaCobranca(chargeId),
      )

      for (const r of recebiveis) {
        await sql`
          INSERT INTO pagarme_recebiveis (
            id, charge_id, payment_id, parcela, valor_bruto, taxa,
            taxa_antecipacao, tipo, meio_pagamento, status, previsto_para
          ) VALUES (
            ${r.id}, ${r.charge_id}, ${payment_id}::uuid, ${r.installment},
            ${r.amount}, ${r.fee ?? 0}, ${r.anticipation_fee ?? 0},
            ${r.type}, ${r.payment_method}, ${r.status},
            ${r.payment_date ? r.payment_date.slice(0, 10) : null}::date
          )
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            previsto_para = EXCLUDED.previsto_para,
            taxa = EXCLUDED.taxa,
            taxa_antecipacao = EXCLUDED.taxa_antecipacao,
            atualizado_em = now()
        `
      }

      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: recebiveis.length,
        payload: { payment_id, charge_id: chargeId, parcelas: recebiveis.length },
      })
      return { parcelas: recebiveis.length }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      await registrarFim(jobId, { status: 'failed', payload: { erro: mensagem } })
      throw erro
    }
  },
)
