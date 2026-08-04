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

/**
 * Claim via insert numa tabela de log dedicada (chave primária única, ex.:
 * payment_id). Retorna `{ won: true }` se essa chamada "ganhou" a claim;
 * `{ won: false }` se já foi reivindicada por outra invocação. Lança erro
 * em qualquer falha que NÃO seja violação de unicidade (23505).
 *
 * Se a claim existente for mais velha que `staleAfterMs` (default 10 min) e
 * ainda não estiver marcada como concluída (`completedColumn`), trata como
 * abandonada: apaga, tenta de novo, e devolve a linha antiga em
 * `reclaimedStale` pra o caller limpar efeitos colaterais (ex.: pedido órfão).
 */
export async function claimOnce(
  admin: AdminClient,
  table: string,
  claimRow: Record<string, unknown>,
  options?: ClaimOnceOptions
): Promise<ClaimOnceResult> {
  const staleAfterMs = options?.staleAfterMs ?? DEFAULT_STALE_CLAIM_MS
  const timestampColumn = options?.timestampColumn ?? 'created_at'
  const completedColumn = options?.completedColumn
  const protectColumns = options?.protectColumns ?? []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (admin.from as any).bind(admin)

  const tryInsert = async (): Promise<'won' | 'conflict'> => {
    const { error } = await from(table).insert(claimRow)
    if (!error) return 'won'
    if (error.code === '23505') return 'conflict'
    throw new Error(`claimOnce(${table}) falhou: ${error.message}`)
  }

  const first = await tryInsert()
  if (first === 'won') return { won: true }

  const entries = Object.entries(claimRow).filter(
    ([key, v]) =>
      v !== undefined &&
      v !== null &&
      key !== completedColumn &&
      !protectColumns.includes(key)
  )
  if (entries.length === 0) return { won: false }

  let existingQuery = from(table).select('*')
  for (const [key, value] of entries) {
    existingQuery = existingQuery.eq(key, value)
  }
  const { data: existing } = await existingQuery.maybeSingle()

  if (!existing || typeof existing !== 'object') return { won: false }

  if (completedColumn) {
    const completedAt = (existing as Record<string, unknown>)[completedColumn]
    if (completedAt != null) return { won: false }
  }

  for (const col of protectColumns) {
    if ((existing as Record<string, unknown>)[col] != null) {
      return { won: false }
    }
  }

  const stampedAt = (existing as Record<string, unknown>)[timestampColumn] as
    | string
    | undefined
  if (!stampedAt) return { won: false }

  const ageMs = Date.now() - new Date(stampedAt).getTime()
  if (Number.isNaN(ageMs) || ageMs < staleAfterMs) return { won: false }

  let deleteQuery = from(table).delete()
  for (const [key, value] of entries) {
    deleteQuery = deleteQuery.eq(key, value)
  }
  const { error: deleteError } = await deleteQuery
  if (deleteError) {
    console.error(
      `claimOnce(${table}): falha ao apagar claim stale:`,
      deleteError
    )
  }

  const second = await tryInsert()
  if (second === 'won') {
    return { won: true, reclaimedStale: existing as Record<string, unknown> }
  }
  return { won: false }
}

/** Desfaz a claim (chamar sempre que a ação real falhar depois de reivindicada). */
export async function releaseClaim(
  admin: AdminClient,
  table: string,
  keyColumnOrFilters: string | Record<string, unknown>,
  keyValue?: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (admin.from as any).bind(admin)

  if (typeof keyColumnOrFilters === 'string') {
    const { error } = await from(table)
      .delete()
      .eq(keyColumnOrFilters, keyValue)
    if (error) {
      throw new Error(
        `releaseClaim(${table}) falhou: ${error.message}`
      )
    }
    return
  }

  let deleteQuery = from(table).delete()
  for (const [key, value] of Object.entries(keyColumnOrFilters)) {
    if (value !== undefined && value !== null) {
      deleteQuery = deleteQuery.eq(key, value)
    }
  }
  const { error } = await deleteQuery
  if (error) {
    throw new Error(`releaseClaim(${table}) falhou: ${error.message}`)
  }
}

/**
 * Marca a claim como concluída com sucesso — claimOnce nunca mais a
 * tratará como abandonada. Aceita chave simples ou filtros compostos
 * (mesmo padrão de releaseClaim).
 */
export async function markClaimCompleted(
  admin: AdminClient,
  table: string,
  keyColumnOrFilters: string | Record<string, unknown>,
  keyValue?: string,
  completedColumn = 'completed_at'
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (admin.from as any).bind(admin)
  const stamp = { [completedColumn]: new Date().toISOString() }

  if (typeof keyColumnOrFilters === 'string') {
    const { error } = await from(table)
      .update(stamp)
      .eq(keyColumnOrFilters, keyValue)
    if (error) {
      throw new Error(
        `markClaimCompleted(${table}) falhou: ${error.message}`
      )
    }
    return
  }

  let updateQuery = from(table).update(stamp)
  for (const [key, value] of Object.entries(keyColumnOrFilters)) {
    if (value !== undefined && value !== null) {
      updateQuery = updateQuery.eq(key, value)
    }
  }
  const { error } = await updateQuery
  if (error) {
    throw new Error(`markClaimCompleted(${table}) falhou: ${error.message}`)
  }
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
  admin: AdminClient,
  table: string,
  id: string,
  flagColumn: string,
  staleAfterMs: number | false = DEFAULT_STALE_CLAIM_MS
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (admin.from as any).bind(admin)

  const tryClaim = async (): Promise<boolean> => {
    const { data } = await from(table)
      .update({ [flagColumn]: new Date().toISOString() })
      .eq('id', id)
      .is(flagColumn, null)
      .select('id')
      .maybeSingle()
    return !!data
  }

  if (await tryClaim()) return true

  const { data: row } = await from(table)
    .select(flagColumn)
    .eq('id', id)
    .maybeSingle()

  const flaggedAt = row?.[flagColumn] as string | null | undefined
  if (!flaggedAt) return false

  // Flag permanente: se já tem valor, nunca reivindica de novo.
  if (staleAfterMs === false) return false

  const ageMs = Date.now() - new Date(flaggedAt).getTime()
  if (Number.isNaN(ageMs) || ageMs < staleAfterMs) return false

  await from(table).update({ [flagColumn]: null }).eq('id', id)
  return tryClaim()
}

/** Desfaz a claim por flag (chamar se a ação real falhar depois de reivindicada). */
export async function releaseFlag(
  admin: AdminClient,
  table: string,
  id: string,
  flagColumn: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from as any)(table)
    .update({ [flagColumn]: null })
    .eq('id', id)
  if (error) {
    throw new Error(`releaseFlag(${table}) falhou: ${error.message}`)
  }
}
