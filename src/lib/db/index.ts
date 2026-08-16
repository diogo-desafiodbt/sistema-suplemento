import postgres from 'postgres'

export type Sql = postgres.Sql

const QUERY_TIMEOUT_MS = 15_000

const globalForDb = globalThis as unknown as { __ddSql?: Sql }

function createSql(): Sql {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL precisa estar definida.')
  }

  return postgres(url, {
    ssl: 'require',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      statement_timeout: QUERY_TIMEOUT_MS,
    },
  })
}

/** Uma instância só, reaproveitada entre requisições. */
export function getSql(): Sql {
  if (!globalForDb.__ddSql) {
    globalForDb.__ddSql = createSql()
  }
  return globalForDb.__ddSql
}

export function withTransaction<T>(
  fn: (sql: postgres.TransactionSql) => Promise<T>,
) {
  return getSql().begin(fn)
}

/** `numeric` no postgres.js volta string; conta com isso vira concatenação. */
export function asNumber(value: unknown): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}
