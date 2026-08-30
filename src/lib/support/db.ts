// Conexão do suporte com IA, separada da do núcleo.
//
// As ferramentas de `tools.ts` rodavam com `app_web`, que alcança o prontuário
// inteiro. Nenhuma delas lê protocolo, quiz ou registro de saúde — mas isso era
// garantia de código, não de permissão. E o que essas ferramentas devolvem sai
// da AWS para a API da Anthropic, o que torna a diferença entre "não acessa" e
// "não pode acessar" a única que importa.
//
// `app_suporte` enxerga seis tabelas, só leitura. Se uma ferramenta nova tentar
// ler prontuário, o banco recusa.

import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'
import type { Sql } from '@/lib/db'

const globalParaSuporte = globalThis as unknown as { __ddSqlSuporte?: Sql }

let token: { valor: string; expiraEm: number } | null = null

async function senhaIam(hostname: string, port: number, username: string) {
  const agora = Date.now()
  if (token && token.expiraEm > agora) return token.valor

  const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
  const signer = new Signer({ hostname, port, username, region })
  const valor = await signer.getAuthToken()
  token = { valor, expiraEm: agora + 13 * 60 * 1000 }
  return valor
}

/**
 * Conexão de leitura para as ferramentas do suporte.
 *
 * Sem `DATABASE_URL_SUPORTE` cai na conexão do núcleo: em desenvolvimento o
 * papel estreito pode não existir, e derrubar o suporte por isso seria pior
 * que rodar com a credencial ampla numa máquina local com dado sintético.
 * Em produção a variável está definida.
 */
export function getSqlSuporte(): Sql {
  const url = process.env.DATABASE_URL_SUPORTE
  if (!url) {
    // Import tardio de propósito: evita ciclo entre este módulo e `@/lib/db`.
    const { getSql } = require('@/lib/db') as typeof import('@/lib/db')
    return getSql()
  }

  if (globalParaSuporte.__ddSqlSuporte) return globalParaSuporte.__ddSqlSuporte

  const parsed = new URL(url)
  const hostname = parsed.hostname
  const port = parsed.port ? Number(parsed.port) : 5432
  const username = decodeURIComponent(parsed.username)

  globalParaSuporte.__ddSqlSuporte = postgres(url, {
    ssl: 'require',
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    password: () => senhaIam(hostname, port, username),
    connection: { statement_timeout: 20_000 },
  })
  return globalParaSuporte.__ddSqlSuporte
}
