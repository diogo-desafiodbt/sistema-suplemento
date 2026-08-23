/**
 * Conexão ao banco `conteudo` (job_conteudo + token IAM).
 * Espelha src/lib/conteudo/db.ts para scripts Node avulsos.
 */

import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'

const QUERY_TIMEOUT_MS = 15_000
const TOKEN_TTL_MS = 13 * 60 * 1000

const CONFLICT_COLUMNS = {
  hotmart_sales: ['transaction_code'],
  omie_categorias: ['codigo'],
  omie_movimentos_financeiros: ['codigo_titulo'],
  youtube_videos: ['video_id'],
  youtube_canal_diario: ['dia'],
  youtube_video_diario: ['video_id', 'dia'],
  youtube_video_snapshot: ['video_id', 'dia'],
  youtube_retencao: ['video_id', 'ponto', 'periodo_fim'],
  youtube_demografia: ['mes', 'faixa_etaria', 'genero'],
  youtube_geografia: ['mes', 'pais'],
  youtube_trafego_diario: ['dia', 'fonte'],
  youtube_termos_busca: ['mes', 'termo'],
  youtube_audiencia_recortes: ['mes', 'tipo', 'valor'],
}

/** @type {postgres.Sql | undefined} */
let sqlInstance = undefined
/** @type {{ value: string; expiresAt: number } | null} */
let cachedIamToken = null

function parseDatabaseUrl(url) {
  const parsed = new URL(url)
  return {
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username),
    hasPassword: Boolean(parsed.password),
  }
}

async function getIamAuthToken(opts) {
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

function createSql() {
  const url = process.env.CONTEUDO_DATABASE_URL
  if (!url) {
    throw new Error('CONTEUDO_DATABASE_URL precisa estar definida.')
  }

  const { hostname, port, username, hasPassword } = parseDatabaseUrl(url)

  /** @type {postgres.Options<Record<string, never>>} */
  const options = {
    ssl: 'require',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      statement_timeout: QUERY_TIMEOUT_MS,
    },
  }

  if (!hasPassword) {
    if (!username) {
      throw new Error(
        'CONTEUDO_DATABASE_URL sem usuário: necessário para gerar o token IAM.',
      )
    }
    options.password = () => getIamAuthToken({ hostname, port, username })
  }

  return postgres(url, options)
}

export function getSqlConteudo() {
  if (!sqlInstance) {
    sqlInstance = createSql()
  }
  return sqlInstance
}

/** Lote vazio → 0, sem query. */
export async function upsertConteudo(sql, table, rows) {
  if (rows.length === 0) return 0

  const conflictCols = CONFLICT_COLUMNS[table]
  if (!conflictCols) {
    throw new Error(`Tabela desconhecida: ${table}`)
  }

  const conflictSql = conflictCols.map((c) => `"${c}"`).join(', ')
  const updateKeys = Object.keys(rows[0]).filter(
    (k) => !conflictCols.includes(k),
  )
  const onConflict =
    updateKeys.length > 0
      ? `(${conflictSql}) DO UPDATE SET ${updateKeys.map((k) => `"${k}" = EXCLUDED."${k}"`).join(', ')}`
      : `(${conflictSql}) DO NOTHING`

  const result = await sql`
    insert into ${sql(table)} ${sql(rows)}
    on conflict ${sql.unsafe(onConflict)}
  `
  return result.count
}
