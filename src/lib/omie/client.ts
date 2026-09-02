const CATEGORIAS_URL =
  'https://app.omie.com.br/api/v1/geral/categorias/'
const MOVIMENTOS_URL = 'https://app.omie.com.br/api/v1/financas/mf/'

/** Pausa entre páginas e entre fatias — evita o guarda de simultaneidade. */
export const OMIE_PAUSE_MS = 1_500

const MAX_TENTATIVAS = 3
const AGUARDE_PADRAO_S = 60
const AGUARDE_FOLGA_S = 2

/** Página padrão; no retry após "consumo redundante" vira 50 (consulta diferente). */
const REGISTROS_PADRAO = 100
const REGISTROS_RETRY = 50

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} ausente`)
  return value
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function snToBool(value: unknown): boolean | null {
  if (value === 'S') return true
  if (value === 'N') return false
  return null
}

/** Converte DD/MM/YYYY → YYYY-MM-DD (ou null). */
export function omieDateToIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Formata Date → DD/MM/YYYY no calendário America/Sao_Paulo. */
export function formatOmieDateSp(date: Date): string {
  const spMs = date.getTime() - 3 * 60 * 60 * 1000
  const sp = new Date(spMs)
  const y = sp.getUTCFullYear()
  const mo = String(sp.getUTCMonth() + 1).padStart(2, '0')
  const d = String(sp.getUTCDate()).padStart(2, '0')
  return `${d}/${mo}/${y}`
}

type OmieEnvelope = {
  call: string
  app_key: string
  app_secret: string
  param: [Record<string, unknown>]
}

function faultMessage(parsed: unknown, httpStatus?: number): string | null {
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    if (typeof obj.faultstring === 'string') return obj.faultstring
    if (typeof obj.message === 'string') return obj.message
  }
  if (httpStatus && httpStatus >= 400) {
    return typeof parsed === 'string'
      ? parsed
      : `HTTP ${httpStatus}: ${JSON.stringify(parsed)}`
  }
  return null
}

/** Extrai "Aguarde N segundos" da mensagem Omie; sem número → 60s. */
export function segundosDeAguardo(mensagem: string): number {
  const m = /aguarde\s+(\d+)\s+segundos?/i.exec(mensagem)
  if (m) return Number(m[1])
  return AGUARDE_PADRAO_S
}

function isBloqueioOmie(mensagem: string): boolean {
  const lower = mensagem.toLowerCase()
  return (
    lower.includes('consumo redundante') ||
    lower.includes('já existe uma requisição') ||
    lower.includes('ja existe uma requisicao') ||
    lower.includes('aguarde')
  )
}

function isConsumoRedundante(mensagem: string): boolean {
  return mensagem.toLowerCase().includes('consumo redundante')
}

/**
 * Depois de "consumo redundante", a mesma consulta byte a byte cai de novo.
 * Trocar o tamanho da página muda o payload sem mudar o conteúdo útil.
 */
function variarTamanhoPagina(param: Record<string, unknown>): void {
  if ('nRegPorPagina' in param) {
    const atual = Number(param.nRegPorPagina) || REGISTROS_PADRAO
    param.nRegPorPagina =
      atual === REGISTROS_PADRAO ? REGISTROS_RETRY : REGISTROS_PADRAO
    return
  }
  if ('registros_por_pagina' in param) {
    const atual = Number(param.registros_por_pagina) || REGISTROS_PADRAO
    param.registros_por_pagina =
      atual === REGISTROS_PADRAO ? REGISTROS_RETRY : REGISTROS_PADRAO
  }
}

/**
 * POST Omie com pausa implícita no caller, leitura do tempo pedido na recusa
 * e no máximo 3 tentativas. Bloqueio que persiste depois disso falha visível.
 */
export async function omiePost(
  url: string,
  call: string,
  param: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let lastError: Error | null = null

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const body: OmieEnvelope = {
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
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      /* keep raw */
    }

    const fault = faultMessage(parsed, res.ok ? undefined : res.status)

    if (fault && isBloqueioOmie(fault)) {
      lastError = new Error(`Omie ${call}: ${fault}`)
      if (tentativa >= MAX_TENTATIVAS) break

      const esperarS = segundosDeAguardo(fault) + AGUARDE_FOLGA_S
      console.warn(
        `Omie ${call}: bloqueio (tentativa ${tentativa}/${MAX_TENTATIVAS}) — aguardando ${esperarS}s`,
      )
      await sleep(esperarS * 1000)

      // Consulta idêntica após "consumo redundante" é recusada de novo.
      if (isConsumoRedundante(fault)) {
        variarTamanhoPagina(param)
      }
      continue
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

    if (fault) {
      throw new Error(`Omie ${call}: ${fault}`)
    }

    return parsed as Record<string, unknown>
  }

  throw (
    lastError ??
    new Error(`Omie ${call}: bloqueio persistiu após ${MAX_TENTATIVAS} tentativas`)
  )
}

export type OmieCategoriaItem = {
  codigo?: string
  descricao?: string
  descricao_padrao?: string
  categoria_superior?: string
  codigo_dre?: string
  conta_receita?: string
  conta_despesa?: string
  totalizadora?: string
  conta_inativa?: string
  tipo_categoria?: string
  [key: string]: unknown
}

export type OmieMovimentoItem = {
  detalhes?: {
    nCodTitulo?: number
    nCodTitRepet?: number
    cGrupo?: string
    cNatureza?: string
    cCodCateg?: string
    cCodProjeto?: number
    nCodCliente?: number
    cCPFCNPJCliente?: string
    nCodCC?: number
    cNumParcela?: string
    cOrigem?: string
    cTipo?: string
    cStatus?: string
    dDtEmissao?: string
    dDtVenc?: string
    dDtPrevisao?: string
    dDtRegistro?: string
    dDtPagamento?: string
    nValorTitulo?: number
  }
  resumo?: {
    cLiquidado?: string
    nValPago?: number
    nValLiquido?: number
    nValAberto?: number
    nDesconto?: number
    nJuros?: number
    nMulta?: number
  }
}

export function mapCategoriaRow(item: OmieCategoriaItem) {
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

export function mapMovimentoRow(item: OmieMovimentoItem) {
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

/** Pagina ListarCategorias até acabar. */
export async function fetchAllCategorias(): Promise<OmieCategoriaItem[]> {
  const all: OmieCategoriaItem[] = []
  let pagina = 1
  let totalPaginas = 1

  while (pagina <= totalPaginas) {
    if (pagina > 1) await sleep(OMIE_PAUSE_MS)

    const data = await omiePost(CATEGORIAS_URL, 'ListarCategorias', {
      pagina,
      registros_por_pagina: REGISTROS_PADRAO,
      apenas_importado_api: 'N',
    })

    const items = data.categoria_cadastro
    if (Array.isArray(items)) {
      all.push(...(items as OmieCategoriaItem[]))
    }

    totalPaginas = Number(data.total_de_paginas) || 1
    pagina += 1
  }

  return all
}

export type FetchMovimentosParams = {
  /** DD/MM/YYYY */
  dDtPagtoDe: string
  /** DD/MM/YYYY */
  dDtPagtoAte: string
}

export type MovimentosResult = {
  items: OmieMovimentoItem[]
  /** Total declarado pela Omie (`nTotRegistros`); null se a API não mandou. */
  nTotRegistros: number | null
}

/** Pagina ListarMovimentos (LIQUIDADO) até acabar. */
export async function fetchAllMovimentosLiquidados(
  params: FetchMovimentosParams,
): Promise<MovimentosResult> {
  const all: OmieMovimentoItem[] = []
  let nPagina = 1
  let nTotPaginas = 1
  let nTotRegistros: number | null = null

  while (nPagina <= nTotPaginas) {
    if (nPagina > 1) await sleep(OMIE_PAUSE_MS)

    const data = await omiePost(MOVIMENTOS_URL, 'ListarMovimentos', {
      nPagina,
      nRegPorPagina: REGISTROS_PADRAO,
      cStatus: 'LIQUIDADO',
      dDtPagtoDe: params.dDtPagtoDe,
      dDtPagtoAte: params.dDtPagtoAte,
    })

    const items = data.movimentos
    if (Array.isArray(items)) {
      all.push(...(items as OmieMovimentoItem[]))
    }

    if (data.nTotRegistros != null && Number.isFinite(Number(data.nTotRegistros))) {
      nTotRegistros = Number(data.nTotRegistros)
    }

    nTotPaginas = Number(data.nTotPaginas) || 1
    nPagina += 1
  }

  if (nTotRegistros != null && all.length !== nTotRegistros) {
    console.warn(
      `Omie ListarMovimentos: juntamos ${all.length}, API declarou nTotRegistros=${nTotRegistros}`,
    )
  }

  return { items: all, nTotRegistros }
}
