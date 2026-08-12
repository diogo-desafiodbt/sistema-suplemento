import {
  epochMsToIso,
  fetchAllSalesHistory,
  type HotmartSaleItem,
} from '@/lib/hotmart/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '../client'

const SP_OFFSET = '-03:00'

/** Janela dos últimos 2 dias corridos em America/Sao_Paulo (início do dia D-2 → agora). */
function lastTwoCalendarDaysWindow(now: Date): {
  startMs: number
  endMs: number
  windowStart: string
  windowEnd: string
} {
  const spMs = now.getTime() - 3 * 60 * 60 * 1000
  const startDay = new Date(spMs)
  startDay.setUTCDate(startDay.getUTCDate() - 2)
  const startStr = startDay.toISOString().slice(0, 10)
  const start = new Date(`${startStr}T00:00:00${SP_OFFSET}`)
  return {
    startMs: start.getTime(),
    endMs: now.getTime(),
    windowStart: start.toISOString(),
    windowEnd: now.toISOString(),
  }
}

function mapSaleRow(item: HotmartSaleItem) {
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

export const hotmartSalesSync = inngest.createFunction(
  {
    id: 'hotmart-sales-sync',
    name: 'Sync diário de vendas Hotmart (Guia Primeiro Passo)',
    triggers: [{ cron: 'TZ=America/Sao_Paulo 0 7 * * *' }],
  },
  async ({ step }) => {
    const result = await step.run('sync-hotmart-sales', async () => {
      const admin = createAdminClient()
      const now = new Date()
      const window = lastTwoCalendarDaysWindow(now)
      const startedAt = now.toISOString()

      const productId = process.env.HOTMART_PRODUCT_ID
      if (!productId) {
        const payload = {
          totalFetched: 0,
          totalUpserted: 0,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
          error: 'HOTMART_PRODUCT_ID ausente',
        }
        await admin.from('background_jobs').insert({
          job_type: 'hotmart_sales_sync',
          status: 'failed',
          payload,
          affected_rows: 0,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
        })
        throw new Error('HOTMART_PRODUCT_ID ausente')
      }

      let items: HotmartSaleItem[]
      try {
        items = await fetchAllSalesHistory({
          productId,
          startDateMs: window.startMs,
          endDateMs: window.endMs,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        await admin.from('background_jobs').insert({
          job_type: 'hotmart_sales_sync',
          status: 'failed',
          payload: {
            totalFetched: 0,
            totalUpserted: 0,
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

      const rows = items
        .map(mapSaleRow)
        .filter((row): row is NonNullable<typeof row> => row !== null)

      let totalUpserted = 0
      if (rows.length > 0) {
        const { error: upsertError, count } = await admin
          .from('hotmart_sales')
          .upsert(rows, {
            onConflict: 'transaction_code',
            count: 'exact',
          })

        if (upsertError) {
          await admin.from('background_jobs').insert({
            job_type: 'hotmart_sales_sync',
            status: 'failed',
            payload: {
              totalFetched: items.length,
              totalUpserted: 0,
              windowStart: window.windowStart,
              windowEnd: window.windowEnd,
              error: upsertError.message,
            },
            affected_rows: 0,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
          })
          throw new Error(
            `Erro ao upsert hotmart_sales: ${upsertError.message}`,
          )
        }
        totalUpserted = count ?? rows.length
      }

      const payload = {
        totalFetched: items.length,
        totalUpserted,
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
      }

      const { error: jobError } = await admin.from('background_jobs').insert({
        job_type: 'hotmart_sales_sync',
        status: 'completed',
        payload,
        affected_rows: totalUpserted,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      })
      if (jobError) {
        console.error(
          'Erro ao gravar background_jobs do hotmart_sales_sync:',
          jobError,
        )
      }

      return payload
    })

    return result
  },
)
