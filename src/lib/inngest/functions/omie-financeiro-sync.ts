import {
  fetchAllCategorias,
  fetchAllMovimentosLiquidados,
  formatOmieDateSp,
  mapCategoriaRow,
  mapMovimentoRow,
} from '@/lib/omie/client'
import { getSqlConteudo, upsertConteudo } from '@/lib/conteudo/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

const SP_OFFSET = '-03:00'

/** Últimos 3 dias corridos em America/Sao_Paulo (início D-2 → hoje). */
function lastThreeCalendarDaysWindow(now: Date): {
  dDtPagtoDe: string
  dDtPagtoAte: string
  windowStart: string
  windowEnd: string
} {
  const spMs = now.getTime() - 3 * 60 * 60 * 1000
  const startDay = new Date(spMs)
  startDay.setUTCDate(startDay.getUTCDate() - 2)
  const startStr = startDay.toISOString().slice(0, 10)
  const start = new Date(`${startStr}T00:00:00${SP_OFFSET}`)

  return {
    dDtPagtoDe: formatOmieDateSp(start),
    dDtPagtoAte: formatOmieDateSp(now),
    windowStart: start.toISOString(),
    windowEnd: now.toISOString(),
  }
}

export const omieFinanceiroSync = inngest.createFunction(
  {
    id: 'omie-financeiro-sync',
    name: 'Sync diário financeiro Omie (liquidados)',
    triggers: [{ cron: 'TZ=America/Sao_Paulo 0 6 * * *' }],
  },
  async ({ step }) => {
    const result = await step.run('sync-omie-financeiro', async () => {
      const sql = getSqlConteudo()
      const now = new Date()
      const window = lastThreeCalendarDaysWindow(now)
      const jobId = await registrarInicio('omie_financeiro_sync')

      try {
        const categorias = await fetchAllCategorias()
        const categoriaRows = categorias
          .map(mapCategoriaRow)
          .filter((row): row is NonNullable<typeof row> => row !== null)

        if (categoriaRows.length > 0) {
          await upsertConteudo(sql, 'omie_categorias', categoriaRows)
        }

        const { items: movimentos, nTotRegistros } =
          await fetchAllMovimentosLiquidados({
            dDtPagtoDe: window.dDtPagtoDe,
            dDtPagtoAte: window.dDtPagtoAte,
          })

        const movimentoRows = movimentos
          .map(mapMovimentoRow)
          .filter((row): row is NonNullable<typeof row> => row !== null)

        let totalMovimentosUpserted = 0
        if (movimentoRows.length > 0) {
          totalMovimentosUpserted = await upsertConteudo(
            sql,
            'omie_movimentos_financeiros',
            movimentoRows,
          )
        }

        const payload = {
          totalCategorias: categoriaRows.length,
          totalMovimentosFetched: movimentos.length,
          totalMovimentosUpserted,
          nTotRegistros,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
        }

        await registrarFim(jobId, {
          status: 'completed',
          payload,
          affectedRows: totalMovimentosUpserted,
        })

        return payload
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        await registrarFim(jobId, {
          status: 'failed',
          payload: {
            totalCategorias: 0,
            totalMovimentosFetched: 0,
            totalMovimentosUpserted: 0,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            error: message,
          },
        })
        throw error
      }
    })

    return result
  },
)
