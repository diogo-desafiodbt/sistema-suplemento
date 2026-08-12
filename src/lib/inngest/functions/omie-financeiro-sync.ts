import {
  fetchAllCategorias,
  fetchAllMovimentosLiquidados,
  formatOmieDateSp,
  mapCategoriaRow,
  mapMovimentoRow,
} from '@/lib/omie/client'
import { createAdminClient } from '@/lib/supabase/admin'
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
      const admin = createAdminClient()
      const now = new Date()
      const startedAt = now.toISOString()
      const window = lastThreeCalendarDaysWindow(now)

      try {
        const categorias = await fetchAllCategorias()
        const categoriaRows = categorias
          .map(mapCategoriaRow)
          .filter((row): row is NonNullable<typeof row> => row !== null)

        if (categoriaRows.length > 0) {
          const { error: catError } = await admin
            .from('omie_categorias')
            .upsert(categoriaRows, { onConflict: 'codigo' })
          if (catError) {
            throw new Error(
              `Upsert omie_categorias: ${catError.message}`,
            )
          }
        }

        const movimentos = await fetchAllMovimentosLiquidados({
          dDtPagtoDe: window.dDtPagtoDe,
          dDtPagtoAte: window.dDtPagtoAte,
        })

        const movimentoRows = movimentos
          .map(mapMovimentoRow)
          .filter((row): row is NonNullable<typeof row> => row !== null)

        let totalMovimentosUpserted = 0
        if (movimentoRows.length > 0) {
          const { error: movError, count } = await admin
            .from('omie_movimentos_financeiros')
            .upsert(movimentoRows, {
              onConflict: 'codigo_titulo',
              count: 'exact',
            })
          if (movError) {
            throw new Error(
              `Upsert omie_movimentos_financeiros: ${movError.message}`,
            )
          }
          totalMovimentosUpserted = count ?? movimentoRows.length
        }

        const payload = {
          totalCategorias: categoriaRows.length,
          totalMovimentosFetched: movimentos.length,
          totalMovimentosUpserted,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
        }

        const { error: jobError } = await admin.from('background_jobs').insert({
          job_type: 'omie_financeiro_sync',
          status: 'completed',
          payload,
          affected_rows: totalMovimentosUpserted,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        })
        if (jobError) {
          console.error(
            'Erro ao gravar background_jobs do omie_financeiro_sync:',
            jobError,
          )
        }

        return payload
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        await admin.from('background_jobs').insert({
          job_type: 'omie_financeiro_sync',
          status: 'failed',
          payload: {
            totalCategorias: 0,
            totalMovimentosFetched: 0,
            totalMovimentosUpserted: 0,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            error: message,
          },
          affected_rows: 0,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        })
        throw error
      }
    })

    return result
  },
)
