import {
  epochMsToIso,
  fetchAllSalesHistory,
  type HotmartSaleItem,
} from '@/lib/hotmart/client'
import { getSqlConteudo, upsertConteudo } from '@/lib/conteudo/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

const SP_OFFSET = '-03:00'

/**
 * CPF do comprador, quando a Hotmart manda.
 *
 * O Diogo ligou a exigência de CPF no checkout em 25/08/2026. O campo não
 * aparecia no retorno até então, e a documentação da Hotmart não deixa claro
 * com que nome ele vem — pode ser `document`, `cpf` ou `documentNumber`,
 * dependendo da versão da API. Em vez de apostar num nome e descobrir daqui a
 * um mês que ficou tudo nulo, procuramos os três.
 *
 * Guarda só dígitos: o CPF do sistema vem sem pontuação, e casar
 * "529.982.247-25" com "52998224725" falharia em silêncio.
 */
function documentoDoComprador(buyer: unknown): string | null {
  if (!buyer || typeof buyer !== 'object') return null
  const b = buyer as Record<string, unknown>
  for (const chave of ['document', 'cpf', 'documentNumber', 'document_number']) {
    const v = b[chave]
    if (typeof v === 'string' && v.trim()) {
      const digitos = v.replace(/\D/g, '')
      if (digitos.length >= 11) return digitos
    }
  }
  return null
}

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
    buyer_document: documentoDoComprador(item.buyer),
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
      const sql = getSqlConteudo()
      const now = new Date()
      const window = lastTwoCalendarDaysWindow(now)
      const jobId = await registrarInicio('hotmart_sales_sync')

      const fail = async (error: unknown, extra?: Record<string, unknown>) => {
        const message =
          error instanceof Error ? error.message : String(error)
        await registrarFim(jobId, {
          status: 'failed',
          payload: {
            totalFetched: 0,
            totalUpserted: 0,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            error: message,
            ...extra,
          },
        })
      }

      const productId = process.env.HOTMART_PRODUCT_ID
      if (!productId) {
        await fail(new Error('HOTMART_PRODUCT_ID ausente'))
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
        await fail(error)
        throw error
      }

      const rows = items
        .map(mapSaleRow)
        .filter((row): row is NonNullable<typeof row> => row !== null)

      let totalUpserted = 0
      if (rows.length > 0) {
        try {
          totalUpserted = await upsertConteudo(sql, 'hotmart_sales', rows)
        } catch (error) {
          await fail(error, { totalFetched: items.length })
          throw new Error(
            `Erro ao upsert hotmart_sales: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      const payload = {
        totalFetched: items.length,
        totalUpserted,
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
      }

      await registrarFim(jobId, {
        status: 'completed',
        payload,
        affectedRows: totalUpserted,
      })

      return payload
    })

    return result
  },
)
