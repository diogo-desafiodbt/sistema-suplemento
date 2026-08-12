/**
 * Backfill único — últimos ~6 meses de vendas Hotmart (Guia Primeiro Passo).
 * Uso: node scripts/hotmart-backfill.mjs
 *
 * Idempotente (upsert por transaction_code). Não altera o job diário Inngest.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const SLICE_COUNT = 6

function loadEnv() {
  const envPath = resolve(root, '.env.local')
  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv()

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} ausente`)
  return value
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
)

let tokenCache = null

async function getHotmartAccessToken() {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token
  }

  const clientId = requireEnv('HOTMART_CLIENT_ID')
  const clientSecret = requireEnv('HOTMART_CLIENT_SECRET')
  const basicToken = requireEnv('HOTMART_BASIC_TOKEN')

  const url = new URL(
    'https://api-sec-vlc.hotmart.com/security/oauth/token',
  )
  url.searchParams.set('grant_type', 'client_credentials')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('client_secret', clientSecret)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: basicToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  const text = await res.text()
  let parsed = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    /* keep raw */
  }

  if (!res.ok) {
    const detail =
      typeof parsed === 'object' && parsed !== null
        ? JSON.stringify(parsed)
        : String(parsed)
    throw new Error(`Hotmart OAuth → ${res.status}: ${detail}`)
  }

  if (!parsed?.access_token) {
    throw new Error('Hotmart OAuth: access_token ausente na resposta')
  }

  const expiresInMs = (parsed.expires_in ?? 86400) * 1000
  tokenCache = {
    token: parsed.access_token,
    expiresAt: now + expiresInMs,
  }
  return parsed.access_token
}

async function fetchAllSalesHistory({ productId, startDateMs, endDateMs }) {
  const accessToken = await getHotmartAccessToken()
  const all = []
  let pageToken

  do {
    const url = new URL(
      'https://developers.hotmart.com/payments/api/v1/sales/history',
    )
    url.searchParams.set('product_id', productId)
    url.searchParams.set('start_date', String(startDateMs))
    url.searchParams.set('end_date', String(endDateMs))
    url.searchParams.set('max_results', '50')
    if (pageToken) {
      url.searchParams.set('page_token', pageToken)
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    const text = await res.text()
    let parsed = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      /* keep raw */
    }

    if (!res.ok) {
      const detail =
        typeof parsed === 'object' && parsed !== null
          ? JSON.stringify(parsed)
          : String(parsed)
      throw new Error(`Hotmart sales/history → ${res.status}: ${detail}`)
    }

    if (Array.isArray(parsed?.items)) {
      all.push(...parsed.items)
    }
    pageToken = parsed?.page_info?.next_page_token || undefined
  } while (pageToken)

  return all
}

function epochMsToIso(ms) {
  if (ms == null || !Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

/** Mesmo mapeamento de mapSaleRow em hotmart-sales-sync.ts */
function mapSaleRow(item) {
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

function buildMonthlySlices(endMs) {
  const startMs = endMs - SLICE_COUNT * MONTH_MS
  const slices = []
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

async function main() {
  const productId = requireEnv('HOTMART_PRODUCT_ID')
  const endMs = Date.now()
  const slices = buildMonthlySlices(endMs)

  console.log(
    `Hotmart backfill — produto ${productId}, ${SLICE_COUNT} fatias (~6 meses)`,
  )
  console.log(
    `Janela total: ${new Date(slices[0].startMs).toISOString()} → ${new Date(endMs).toISOString()}`,
  )

  let totalFetched = 0
  let totalUpserted = 0
  let totalDiscarded = 0

  for (const slice of slices) {
    console.log(`\n[${slice.index}/${SLICE_COUNT}] ${slice.label}`)

    const items = await fetchAllSalesHistory({
      productId,
      startDateMs: slice.startMs,
      endDateMs: slice.endMs,
    })

    const rows = []
    let discarded = 0
    for (const item of items) {
      const row = mapSaleRow(item)
      if (row) rows.push(row)
      else discarded++
    }

    let upserted = 0
    if (rows.length > 0) {
      const { error, count } = await supabase.from('hotmart_sales').upsert(rows, {
        onConflict: 'transaction_code',
        count: 'exact',
      })
      if (error) {
        throw new Error(
          `Upsert fatia ${slice.index} falhou: ${error.message}`,
        )
      }
      upserted = count ?? rows.length
    }

    totalFetched += items.length
    totalUpserted += upserted
    totalDiscarded += discarded

    console.log(
      `  API: ${items.length} itens | upsert: ${upserted} | descartados: ${discarded}`,
    )
  }

  console.log('\n———')
  console.log(
    `Total: fetched=${totalFetched} upserted=${totalUpserted} discarded=${totalDiscarded}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
