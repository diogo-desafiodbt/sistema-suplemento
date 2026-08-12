/**
 * Backfill único — categorias Omie + últimos ~6 meses de movimentos liquidados.
 * Uso: node scripts/omie-backfill.mjs
 *
 * Idempotente (upsert por codigo / codigo_titulo). Não altera o job diário.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const SLICE_COUNT = 6
const PAGE_DELAY_MS = 300
const CATEGORIAS_URL = 'https://app.omie.com.br/api/v1/geral/categorias/'
const MOVIMENTOS_URL = 'https://app.omie.com.br/api/v1/financas/mf/'

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
)

function snToBool(value) {
  if (value === 'S') return true
  if (value === 'N') return false
  return null
}

function omieDateToIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function formatOmieDate(ms) {
  const sp = new Date(ms - 3 * 60 * 60 * 1000)
  const sd = String(sp.getUTCDate()).padStart(2, '0')
  const sm = String(sp.getUTCMonth() + 1).padStart(2, '0')
  const sy = sp.getUTCFullYear()
  return `${sd}/${sm}/${sy}`
}

async function omiePost(url, call, param) {
  const body = {
    call,
    app_key: requireEnv('OMIE_APP_KEY'),
    app_secret: requireEnv('OMIE_APP_SECRET'),
    param: [param],
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
    throw new Error(`Omie ${call} → ${res.status}: ${detail}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Omie ${call}: resposta inválida`)
  }

  if (typeof parsed.faultstring === 'string') {
    throw new Error(`Omie ${call}: ${parsed.faultstring}`)
  }

  return parsed
}

function mapCategoriaRow(item) {
  if (!item.codigo) return null
  return {
    codigo: item.codigo,
    descricao: item.descricao ?? null,
    descricao_padrao: item.descricao_padrao ?? null,
    categoria_superior: item.categoria_superior ?? null,
    codigo_dre: item.codigo_dre ?? null,
    conta_receita: snToBool(item.conta_receita),
    conta_despesa: snToBool(item.conta_despesa),
    totalizadora: snToBool(item.totalizadora),
    conta_inativa: snToBool(item.conta_inativa),
    tipo_categoria: item.tipo_categoria ?? null,
    raw_payload: item,
    synced_at: new Date().toISOString(),
  }
}

function mapMovimentoRow(item) {
  const d = item.detalhes
  const r = item.resumo
  const codigoTitulo = d?.nCodTitulo
  const grupo = d?.cGrupo
  if (codigoTitulo == null || !grupo) return null

  return {
    codigo_titulo: codigoTitulo,
    codigo_titulo_repeticao: d?.nCodTitRepet ?? null,
    grupo,
    natureza: d?.cNatureza ?? null,
    categoria_codigo: d?.cCodCateg ?? null,
    projeto_codigo: d?.cCodProjeto ?? null,
    cliente_fornecedor_codigo: d?.nCodCliente ?? null,
    cliente_cpf_cnpj: d?.cCPFCNPJCliente ?? null,
    conta_corrente_codigo: d?.nCodCC ?? null,
    numero_parcela: d?.cNumParcela ?? null,
    origem: d?.cOrigem ?? null,
    tipo: d?.cTipo ?? null,
    status: d?.cStatus ?? null,
    data_emissao: omieDateToIso(d?.dDtEmissao),
    data_vencimento: omieDateToIso(d?.dDtVenc),
    data_previsao: omieDateToIso(d?.dDtPrevisao),
    data_registro: omieDateToIso(d?.dDtRegistro),
    data_pagamento: omieDateToIso(d?.dDtPagamento),
    valor_titulo: d?.nValorTitulo ?? null,
    liquidado: snToBool(r?.cLiquidado),
    valor_pago: r?.nValPago ?? null,
    valor_liquido: r?.nValLiquido ?? null,
    valor_aberto: r?.nValAberto ?? null,
    desconto: r?.nDesconto ?? null,
    juros: r?.nJuros ?? null,
    multa: r?.nMulta ?? null,
    raw_payload: item,
    synced_at: new Date().toISOString(),
  }
}

async function fetchAllCategorias() {
  const all = []
  let pagina = 1
  let totalPaginas = 1

  while (pagina <= totalPaginas) {
    if (pagina > 1) await sleep(PAGE_DELAY_MS)
    const data = await omiePost(CATEGORIAS_URL, 'ListarCategorias', {
      pagina,
      registros_por_pagina: 50,
      apenas_importado_api: 'N',
    })
    if (Array.isArray(data.categoria_cadastro)) {
      all.push(...data.categoria_cadastro)
    }
    totalPaginas = Number(data.total_de_paginas) || 1
    pagina += 1
  }

  return all
}

async function fetchAllMovimentosLiquidados(dDtPagtoDe, dDtPagtoAte) {
  const all = []
  let nPagina = 1
  let nTotPaginas = 1

  while (nPagina <= nTotPaginas) {
    if (nPagina > 1) await sleep(PAGE_DELAY_MS)
    const data = await omiePost(MOVIMENTOS_URL, 'ListarMovimentos', {
      nPagina,
      nRegPorPagina: 50,
      cStatus: 'LIQUIDADO',
      dDtPagtoDe,
      dDtPagtoAte,
    })
    if (Array.isArray(data.movimentos)) {
      all.push(...data.movimentos)
    }
    nTotPaginas = Number(data.nTotPaginas) || 1
    nPagina += 1
  }

  return all
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
      dDtPagtoDe: formatOmieDate(sliceStart),
      dDtPagtoAte: formatOmieDate(sliceEnd),
      label: `${formatOmieDate(sliceStart)} → ${formatOmieDate(sliceEnd)}`,
    })
  }
  return slices
}

async function main() {
  console.log('Omie backfill — categorias + movimentos liquidados (~6 meses)')

  console.log('\n[1] Sincronizando categorias…')
  const categorias = await fetchAllCategorias()
  const catRows = categorias.map(mapCategoriaRow).filter(Boolean)
  if (catRows.length > 0) {
    const { error } = await supabase
      .from('omie_categorias')
      .upsert(catRows, { onConflict: 'codigo' })
    if (error) throw new Error(`Upsert categorias: ${error.message}`)
  }
  console.log(`  Categorias: API=${categorias.length} upsert=${catRows.length}`)

  const endMs = Date.now()
  const slices = buildMonthlySlices(endMs)
  console.log(
    `\n[2] Movimentos liquidados — ${SLICE_COUNT} fatias (~6 meses)`,
  )

  let totalFetched = 0
  let totalUpserted = 0
  let totalDiscarded = 0

  for (const slice of slices) {
    console.log(`\n[${slice.index}/${SLICE_COUNT}] ${slice.label}`)

    const items = await fetchAllMovimentosLiquidados(
      slice.dDtPagtoDe,
      slice.dDtPagtoAte,
    )

    const rows = []
    let discarded = 0
    for (const item of items) {
      const row = mapMovimentoRow(item)
      if (row) rows.push(row)
      else discarded++
    }

    let upserted = 0
    if (rows.length > 0) {
      const { error, count } = await supabase
        .from('omie_movimentos_financeiros')
        .upsert(rows, { onConflict: 'codigo_titulo', count: 'exact' })
      if (error) {
        throw new Error(`Upsert fatia ${slice.index}: ${error.message}`)
      }
      upserted = count ?? rows.length
    }

    totalFetched += items.length
    totalUpserted += upserted
    totalDiscarded += discarded

    console.log(
      `  API: ${items.length} | upsert: ${upserted} | descartados: ${discarded}`,
    )
  }

  console.log('\n———')
  console.log(
    `Total movimentos: fetched=${totalFetched} upserted=${totalUpserted} discarded=${totalDiscarded}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
