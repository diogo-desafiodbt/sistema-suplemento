import { getSqlConteudo, upsertConteudo } from '@/lib/conteudo/db'
import {
  fetchAllCategorias,
  fetchAllMovimentosLiquidados,
  formatOmieDateSp,
  mapCategoriaRow,
  mapMovimentoRow,
  OMIE_PAUSE_MS,
  sleep,
} from '@/lib/omie/client'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const SLICE_COUNT = 12

type SliceMeta = {
  index: number
  dDtPagtoDe: string
  dDtPagtoAte: string
  label: string
}

type FatiaResult = {
  fatia: number
  buscadas: number
  gravadas: number
  descartadas: number
  nTotRegistros: number | null
  label: string
  ok: boolean
  erro?: string
}

function buildMonthlySlices(endMs: number): SliceMeta[] {
  const startMs = endMs - SLICE_COUNT * MONTH_MS
  const slices: SliceMeta[] = []
  for (let i = 0; i < SLICE_COUNT; i++) {
    const sliceStart = startMs + i * MONTH_MS
    const sliceEnd =
      i === SLICE_COUNT - 1 ? endMs : startMs + (i + 1) * MONTH_MS
    slices.push({
      index: i + 1,
      dDtPagtoDe: formatOmieDateSp(new Date(sliceStart)),
      dDtPagtoAte: formatOmieDateSp(new Date(sliceEnd)),
      label: `${formatOmieDateSp(new Date(sliceStart))} → ${formatOmieDateSp(new Date(sliceEnd))}`,
    })
  }
  return slices
}

export const omieBackfill = inngest.createFunction(
  {
    id: 'omie-backfill',
    name: 'Backfill 12 meses Omie',
    triggers: [{ event: 'conteudo/omie.backfill' }],
  },
  async ({ step }) => {
    const jobId = await step.run('registrar-inicio', () =>
      registrarInicio('omie_backfill'),
    )

    let fimRegistrado = false

    try {
      const categoriasResult = await step.run('categorias', async () => {
        const categorias = await fetchAllCategorias()
        const rows = categorias
          .map(mapCategoriaRow)
          .filter((row): row is NonNullable<typeof row> => row !== null)

        let gravadas = 0
        if (rows.length > 0) {
          const sql = getSqlConteudo()
          gravadas = await upsertConteudo(sql, 'omie_categorias', rows)
        }

        console.log(
          `categorias — ${categorias.length} buscadas, ${gravadas} gravadas`,
        )

        return {
          buscadas: categorias.length,
          gravadas,
        }
      })

      const janela = await step.run('calcular-janela', () => {
        const endMs = Date.now()
        const slices = buildMonthlySlices(endMs)
        return {
          endMs,
          slices,
          windowStart: new Date(endMs - SLICE_COUNT * MONTH_MS).toISOString(),
          windowEnd: new Date(endMs).toISOString(),
        }
      })

      const fatias: FatiaResult[] = []

      for (const slice of janela.slices) {
        if (slice.index > 1) {
          await step.run(`pausa-antes-fatia-${slice.index}`, () =>
            sleep(OMIE_PAUSE_MS),
          )
        }

        const result = await step.run(`fatia-${slice.index}`, async () => {
          try {
            const { items, nTotRegistros } =
              await fetchAllMovimentosLiquidados({
                dDtPagtoDe: slice.dDtPagtoDe,
                dDtPagtoAte: slice.dDtPagtoAte,
              })

            const rows: Record<string, unknown>[] = []
            let descartadas = 0
            for (const item of items) {
              const row = mapMovimentoRow(item)
              if (row) rows.push(row)
              else descartadas++
            }

            let gravadas = 0
            if (rows.length > 0) {
              const sql = getSqlConteudo()
              gravadas = await upsertConteudo(
                sql,
                'omie_movimentos_financeiros',
                rows,
              )
            }

            console.log(
              `fatia ${slice.index}/${SLICE_COUNT} — ${items.length} buscadas, ${gravadas} gravadas` +
                (nTotRegistros != null
                  ? ` (nTotRegistros=${nTotRegistros})`
                  : ''),
            )

            return {
              fatia: slice.index,
              buscadas: items.length,
              gravadas,
              descartadas,
              nTotRegistros,
              label: slice.label,
              ok: true,
            } satisfies FatiaResult
          } catch (error) {
            const mensagem =
              error instanceof Error ? error.message : String(error)
            console.error(
              `fatia ${slice.index}/${SLICE_COUNT} FALHOU — ${mensagem}`,
            )
            return {
              fatia: slice.index,
              buscadas: 0,
              gravadas: 0,
              descartadas: 0,
              nTotRegistros: null,
              label: slice.label,
              ok: false,
              erro: mensagem,
            } satisfies FatiaResult
          }
        })
        fatias.push(result)
      }

      const totalMovBuscadas = fatias.reduce((s, f) => s + f.buscadas, 0)
      const totalMovGravadas = fatias.reduce((s, f) => s + f.gravadas, 0)
      const totalMovDescartadas = fatias.reduce((s, f) => s + f.descartadas, 0)
      const fatiasFalhas = fatias.filter((f) => !f.ok)
      const somaNTotRegistros = fatias.reduce(
        (s, f) => s + (f.nTotRegistros ?? 0),
        0,
      )

      const payload = {
        windowStart: janela.windowStart,
        windowEnd: janela.windowEnd,
        categorias: categoriasResult,
        /** Total buscado nas 12 fatias — comparar com ~365 da API nos 12 meses. */
        totalMovBuscadas,
        totalMovGravadas,
        totalMovDescartadas,
        somaNTotRegistros,
        fatiasFalhas: fatiasFalhas.length,
        fatias,
      }

      const status =
        fatiasFalhas.length > 0 ? ('failed' as const) : ('completed' as const)

      await step.run('registrar-fim', async () => {
        await registrarFim(jobId, {
          status,
          payload,
          affectedRows: totalMovGravadas,
        })
      })
      fimRegistrado = true

      if (fatiasFalhas.length > 0) {
        throw new Error(
          `Omie backfill: ${fatiasFalhas.length} fatia(s) falharam; totalMovBuscadas=${totalMovBuscadas}`,
        )
      }

      return payload
    } catch (error) {
      if (!fimRegistrado) {
        const message = error instanceof Error ? error.message : String(error)
        await registrarFim(jobId, {
          status: 'failed',
          payload: { error: message },
        })
      }
      throw error
    }
  },
)
