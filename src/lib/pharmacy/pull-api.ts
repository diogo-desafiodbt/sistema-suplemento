import type { NextRequest } from 'next/server'

/** Valida o header Authorization: Bearer <token> contra FARMACIA_API_TOKEN. */
export function isFarmaciaAuthorized(request: NextRequest): boolean {
  const expected = process.env.FARMACIA_API_TOKEN
  if (!expected) return false

  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] === expected
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// São Paulo é UTC-3 fixo (sem horário de verão desde 2019).
const SP_OFFSET = '-03:00'

export type DateRange = {
  gte?: string
  lt?: string
  params: Record<string, string>
  invalid?: string
}

function nextDayIso(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Interpreta `data` (um dia) ou `desde`/`ate` (intervalo) na timezone
 * America/Sao_Paulo e devolve limites UTC para filtrar created_at.
 * Sem parâmetros = histórico completo (sem limites).
 */
export function parseDateRange(searchParams: URLSearchParams): DateRange {
  const data = searchParams.get('data')
  const desde = searchParams.get('desde')
  const ate = searchParams.get('ate')

  const params: Record<string, string> = {}
  if (data) params.data = data
  if (desde) params.desde = desde
  if (ate) params.ate = ate

  for (const [key, value] of Object.entries(params)) {
    if (!DATE_RE.test(value)) {
      return { params, invalid: `Parâmetro "${key}" inválido — use YYYY-MM-DD` }
    }
  }

  if (data) {
    return {
      gte: new Date(`${data}T00:00:00${SP_OFFSET}`).toISOString(),
      lt: new Date(`${nextDayIso(data)}T00:00:00${SP_OFFSET}`).toISOString(),
      params,
    }
  }

  const range: DateRange = { params }
  if (desde) {
    range.gte = new Date(`${desde}T00:00:00${SP_OFFSET}`).toISOString()
  }
  if (ate) {
    range.lt = new Date(`${nextDayIso(ate)}T00:00:00${SP_OFFSET}`).toISOString()
  }
  return range
}
