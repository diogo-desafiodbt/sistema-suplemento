import { getSqlConteudo, upsertConteudo } from '@/lib/conteudo/db'
import {
  epochMsToIso,
  fetchAllSalesHistoryForConta,
  hotmartProductIdForConta,
  parseHotmartConta,
  type HotmartSaleItem,
} from '@/lib/hotmart/client'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const SLICE_COUNT = 12

type SliceMeta = {
  index: number
  startMs: number
  endMs: number
  label: string
}

type FatiaResult = {
  fatia: number
  buscadas: number
  gravadas: number
  descartadas: number
  label: string
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
      startMs: sliceStart,
      endMs: sliceEnd,
      label: `${new Date(sliceStart).toISOString().slice(0, 10)} → ${new Date(sliceEnd).toISOString().slice(0, 10)}`,
    })
  }
  return slices
}

function mapSaleRow(item: HotmartSaleItem, contaProductId: number) {
  const purchase = item.purchase
  const transaction = purchase?.transaction
  if (!transaction) return null

  const productId = item.product?.id
  if (productId == null) return null

  const status = purchase?.status
  if (!status) return null

  return {
    transaction_code: transaction,
    product_id: productId,
    conta_product_id: contaProductId,
    product_name: item.product?.name ?? null,
    buyer_name: item.buyer?.name ?? null,
    buyer_email: item.buyer?.email ?? null,
    buyer_ucode: item.buyer?.ucode ?? null,
    status,
    order_date: epochMsToIso(purchase?.order_date),
    approved_date: epochMsToIso(purchase?.approved_date),
    price_value: purchase?.price?.value ?? null,
    price_currency: purchase?.price?.currency_code ?? null,
    payment_method: purchase?.payment?.method ?? null,
    is_subscription: purchase?.is_subscription ?? null,
    recurrency_number: purchase?.recurrency_number ?? null,
    commission_as: purchase?.commission_as ?? null,
    raw_payload: item,
    synced_at: new Date().toISOString(),
  }
}

export const hotmartBackfill = inngest.createFunction(
  {
    id: 'hotmart-backfill',
    name: 'Backfill 12 meses Hotmart',
    triggers: [{ event: 'conteudo/hotmart.backfill' }],
  },
  async ({ event, step }) => {
    const conta = parseHotmartConta(event.data.conta)
    const productId = hotmartProductIdForConta(conta)
    const contaProductId = Number(productId)

    const jobId = await step.run('registrar-inicio', () =>
      registrarInicio('hotmart_backfill'),
    )

    try {
      const janela = await step.run('calcular-janela', () => {
        const endMs = Date.now()
        const slices = buildMonthlySlices(endMs)
        return {
          endMs,
          slices,
          windowStart: new Date(slices[0].startMs).toISOString(),
          windowEnd: new Date(endMs).toISOString(),
          productId,
        }
      })

      const fatias: FatiaResult[] = []

      for (const slice of janela.slices) {
        const result = await step.run(`fatia-${slice.index}`, async () => {
          const items = await fetchAllSalesHistoryForConta(conta, {
            startDateMs: slice.startMs,
            endDateMs: slice.endMs,
          })

          const rows: Record<string, unknown>[] = []
          let descartadas = 0
          for (const item of items) {
            const row = mapSaleRow(item, contaProductId)
            if (row) rows.push(row)
            else descartadas++
          }

          let gravadas = 0
          if (rows.length > 0) {
            const sql = getSqlConteudo()
            gravadas = await upsertConteudo(sql, 'hotmart_sales', rows)
          }

          console.log(
            `fatia ${slice.index}/${SLICE_COUNT} — ${items.length} buscadas, ${gravadas} gravadas`,
          )

          return {
            fatia: slice.index,
            buscadas: items.length,
            gravadas,
            descartadas,
            label: slice.label,
          } satisfies FatiaResult
        })
        fatias.push(result)
      }

      const totalBuscadas = fatias.reduce((s, f) => s + f.buscadas, 0)
      const totalGravadas = fatias.reduce((s, f) => s + f.gravadas, 0)
      const totalDescartadas = fatias.reduce((s, f) => s + f.descartadas, 0)

      const payload = {
        conta,
        productId,
        windowStart: janela.windowStart,
        windowEnd: janela.windowEnd,
        totalBuscadas,
        totalGravadas,
        totalDescartadas,
        fatias,
      }

      await step.run('registrar-fim', async () => {
        await registrarFim(jobId, {
          status: 'completed',
          payload,
          affectedRows: totalGravadas,
        })
      })

      return payload
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await registrarFim(jobId, {
        status: 'failed',
        payload: { conta, productId, error: message },
      })
      throw error
    }
  },
)
