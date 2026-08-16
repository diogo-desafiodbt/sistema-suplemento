import { getSql, type Sql } from '@/lib/db'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

const DEFAULT_STALE_CLAIM_MS = 10 * 60 * 1000

export type ClaimOnceResult = {
  won: boolean
  /** Linha antiga apagada no reclaim (ex.: order_id órfão em pharmacy_order_dispatch_logs). */
  reclaimedStale?: Record<string, unknown>
}

export type ClaimOnceOptions = {
  staleAfterMs?: number
  /** Coluna de timestamp pra detectar claim abandonada. Default: created_at. */
  timestampColumn?: string
  /**
   * Se a linha existente tiver valor nessa coluna, a claim terminou com sucesso
   * e nunca deve ser tratada como abandonada (mesmo após staleAfterMs).
   */
  completedColumn?: string
  /**
   * Colunas extras que, se preenchidas, também bloqueiam reclaim
   * (ex.: email_sent_at — e-mail saiu, stamp completed_at ainda pode falhar).
   */
  protectColumns?: string[]
}

function eqFilters(sql: Sql, filters: Record<string, unknown>) {
  const entries = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== null,
  )
  return entries.flatMap(([key, value], i) => {
    const v = value as string | number | boolean | Date
    return i === 0
      ? sql`${sql(key)} = ${v}`
      : sql`AND ${sql(key)} = ${v}`
  })
}

function insertableRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== undefined),
  )
}

/**
 * Claim via insert numa tabela de log dedicada (chave primária única, ex.:
 * payment_id). Retorna `{ won: true }` se essa chamada "ganhou" a claim;
 * `{ won: false }` se já foi reivindicada por outra invocação.
 *
 * `admin` permanece na assinatura para os chamadores atuais; o SQL usa `getSql()`.
 */
export async function claimOnce(
  _admin: AdminClient,
  table: string,
  claimRow: Record<string, unknown>,
  options?: ClaimOnceOptions,
): Promise<ClaimOnceResult> {
  const sql = getSql()
  const staleAfterMs = options?.staleAfterMs ?? DEFAULT_STALE_CLAIM_MS
  const timestampColumn = options?.timestampColumn ?? 'created_at'
  const completedColumn = options?.completedColumn
  const protectColumns = options?.protectColumns ?? []
  const row = insertableRow(claimRow)

  const tryInsert = async (): Promise<'won' | 'conflict'> => {
    const inserted = await sql`
      INSERT INTO ${sql(table)} ${sql(row)}
      ON CONFLICT DO NOTHING
      RETURNING *
    `
    return inserted.length > 0 ? 'won' : 'conflict'
  }

  const first = await tryInsert()
  if (first === 'won') return { won: true }

  const entries = Object.entries(row).filter(
    ([key, v]) =>
      v !== undefined &&
      v !== null &&
      key !== completedColumn &&
      !protectColumns.includes(key),
  )
  if (entries.length === 0) return { won: false }

  const filters = Object.fromEntries(entries)
  const existingRows = await sql`
    SELECT * FROM ${sql(table)}
    WHERE ${eqFilters(sql, filters)}
    LIMIT 1
  `
  const existing = (existingRows[0] ?? null) as Record<string, unknown> | null

  if (!existing) return { won: false }

  if (completedColumn) {
    if (existing[completedColumn] != null) return { won: false }
  }

  for (const col of protectColumns) {
    if (existing[col] != null) return { won: false }
  }

  const protectNulls = protectColumns.flatMap((col) => [
    sql`AND ${sql(col)} IS NULL`,
  ])
  const completedNull = completedColumn
    ? sql`AND ${sql(completedColumn)} IS NULL`
    : sql``

  const deleted = await sql`
    DELETE FROM ${sql(table)}
    WHERE ${eqFilters(sql, filters)}
      AND ${sql(timestampColumn)} < now() - (${staleAfterMs} || ' milliseconds')::interval
      ${completedNull}
      ${protectNulls}
    RETURNING *
  `
  const reclaimed = deleted[0] as Record<string, unknown> | undefined
  if (!reclaimed) return { won: false }

  const second = await tryInsert()
  if (second === 'won') {
    return { won: true, reclaimedStale: reclaimed }
  }
  return { won: false }
}

/** Desfaz a claim (chamar sempre que a ação real falhar depois de reivindicada). */
export async function releaseClaim(
  _admin: AdminClient,
  table: string,
  keyColumnOrFilters: string | Record<string, unknown>,
  keyValue?: string,
): Promise<void> {
  const sql = getSql()

  if (typeof keyColumnOrFilters === 'string') {
    await sql`
      DELETE FROM ${sql(table)}
      WHERE ${sql(keyColumnOrFilters)} = ${keyValue ?? ''}
    `
    return
  }

  const filters = Object.fromEntries(
    Object.entries(keyColumnOrFilters).filter(
      ([, v]) => v !== undefined && v !== null,
    ),
  )
  await sql`
    DELETE FROM ${sql(table)}
    WHERE ${eqFilters(sql, filters)}
  `
}

/**
 * Marca a claim como concluída com sucesso — claimOnce nunca mais a
 * tratará como abandonada. Aceita chave simples ou filtros compostos
 * (mesmo padrão de releaseClaim).
 */
export async function markClaimCompleted(
  _admin: AdminClient,
  table: string,
  keyColumnOrFilters: string | Record<string, unknown>,
  keyValue?: string,
  completedColumn = 'completed_at',
): Promise<void> {
  const sql = getSql()
  const stamp = { [completedColumn]: new Date().toISOString() }

  if (typeof keyColumnOrFilters === 'string') {
    await sql`
      UPDATE ${sql(table)}
      SET ${sql(stamp)}
      WHERE ${sql(keyColumnOrFilters)} = ${keyValue ?? ''}
    `
    return
  }

  const filters = Object.fromEntries(
    Object.entries(keyColumnOrFilters).filter(
      ([, v]) => v !== undefined && v !== null,
    ),
  )
  await sql`
    UPDATE ${sql(table)}
    SET ${sql(stamp)}
    WHERE ${eqFilters(sql, filters)}
  `
}

/**
 * Claim via flag numa coluna de uma linha já existente (UPDATE atômico
 * condicional — usado quando não faz sentido ter tabela de log separada).
 *
 * Por default, flag antigo (> staleAfterMs) é tratado como abandonado.
 * Passe `staleAfterMs: false` pra flags permanentes (ex.: auto_ack_sent_at —
 * "uma vez por thread", nunca reclaim).
 */
export async function claimByFlag(
  _admin: AdminClient,
  table: string,
  id: string,
  flagColumn: string,
  staleAfterMs: number | false = DEFAULT_STALE_CLAIM_MS,
): Promise<boolean> {
  const sql = getSql()

  const tryClaim = async (): Promise<boolean> => {
    const rows = await sql`
      UPDATE ${sql(table)}
      SET ${sql(flagColumn)} = now()
      WHERE id = ${id} AND ${sql(flagColumn)} IS NULL
      RETURNING id
    `
    return rows.length > 0
  }

  if (await tryClaim()) return true

  const rows = await sql`
    SELECT ${sql(flagColumn)} FROM ${sql(table)}
    WHERE id = ${id}
    LIMIT 1
  `
  const flaggedAt = (rows[0] as Record<string, unknown> | undefined)?.[
    flagColumn
  ] as string | Date | null | undefined
  if (!flaggedAt) return false

  if (staleAfterMs === false) return false

  await sql`
    UPDATE ${sql(table)}
    SET ${sql(flagColumn)} = NULL
    WHERE id = ${id}
      AND ${sql(flagColumn)} < now() - (${staleAfterMs} || ' milliseconds')::interval
  `
  return tryClaim()
}

/** Desfaz a claim por flag (chamar se a ação real falhar depois de reivindicada). */
export async function releaseFlag(
  _admin: AdminClient,
  table: string,
  id: string,
  flagColumn: string,
): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE ${sql(table)}
    SET ${sql(flagColumn)} = NULL
    WHERE id = ${id}
  `
}
