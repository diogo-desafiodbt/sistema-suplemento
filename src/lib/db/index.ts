import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'

export type Sql = postgres.Sql

const QUERY_TIMEOUT_MS = 15_000
/** Token IAM vale 15 min; renovamos com margem. */
const TOKEN_TTL_MS = 13 * 60 * 1000

const globalForDb = globalThis as unknown as { __ddSql?: Sql }

let cachedIamToken: { value: string; expiresAt: number } | null = null

function parseDatabaseUrl(url: string): {
  hostname: string
  port: number
  username: string
  hasPassword: boolean
} {
  const parsed = new URL(url)
  return {
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username),
    hasPassword: Boolean(parsed.password),
  }
}

async function getIamAuthToken(opts: {
  hostname: string
  port: number
  username: string
}): Promise<string> {
  const now = Date.now()
  if (cachedIamToken && cachedIamToken.expiresAt > now) {
    return cachedIamToken.value
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
  if (!region) {
    throw new Error(
      'AWS_REGION (ou AWS_DEFAULT_REGION) precisa estar definida para autenticação IAM no RDS.',
    )
  }

  const signer = new Signer({
    hostname: opts.hostname,
    port: opts.port,
    username: opts.username,
    region,
  })
  const token = await signer.getAuthToken()
  cachedIamToken = { value: token, expiresAt: now + TOKEN_TTL_MS }
  return token
}

function createSql(): Sql {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL precisa estar definida.')
  }

  const { hostname, port, username, hasPassword } = parseDatabaseUrl(url)

  const options: postgres.Options<Record<string, never>> = {
    ssl: 'require',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      statement_timeout: QUERY_TIMEOUT_MS,
    },
  }

  // Senha na URL → Supabase/dev. Sem senha → token IAM assinado para o usuário da URL.
  if (!hasPassword) {
    if (!username) {
      throw new Error(
        'DATABASE_URL sem usuário: necessário para gerar o token IAM.',
      )
    }
    options.password = () => getIamAuthToken({ hostname, port, username })
  }

  return postgres(url, options)
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
