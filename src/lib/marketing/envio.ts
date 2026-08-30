// Disparo de e-mail de marketing, feito pelo núcleo.
//
// Por que aqui e não no satélite: a Lambda `satelite-comercial` roda na VPC
// sem saída para a internet — a subnet tem rota para Internet Gateway, mas
// Lambda em VPC não recebe IP público e não há NAT. Ela nunca alcançou a API
// da Resend, e é por isso que "Enviar teste" e "Criar na Resend" nunca
// funcionaram desde que foram escritos.
//
// O núcleo tem saída e já fala com a Resend. O formulário do satélite aponta
// para a rota de ação daqui, chamada pelo navegador de quem está logado — a
// Lambda continua sem rota de rede para o núcleo.
//
// Três travas fazem isso caber na regra de arquitetura:
//   1. Esta camada NUNCA devolve dado do núcleo. A rota responde com um
//      redirecionamento de sucesso ou de erro, e nada mais.
//   2. Roda com `app_marketing_envio`, que enxerga o schema `marketing` e nada
//      de `public` — prontuário, pedido e pagamento não existem para ele.
//   3. Usa a chave da Resend restrita ao domínio de marketing, não a do
//      domínio raiz que envia prescrição e recuperação de senha.

import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'
import type { Sql } from '@/lib/db'

const REMETENTE =
  'Desafio Diabetes <contato@novidades.desafiodiabetes.com>'
const RESPONDER_PARA = 'contato@desafiodiabetes.com'

const globalParaMarketing = globalThis as unknown as {
  __ddSqlMarketing?: Sql
}

let tokenIam: { valor: string; expiraEm: number } | null = null

async function senhaIam(hostname: string, port: number, username: string) {
  const agora = Date.now()
  if (tokenIam && tokenIam.expiraEm > agora) return tokenIam.valor

  const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
  const signer = new Signer({ hostname, port, username, region })
  const valor = await signer.getAuthToken()
  // O token vale 15 minutos; renovamos com margem, como no núcleo.
  tokenIam = { valor, expiraEm: agora + 13 * 60 * 1000 }
  return valor
}

/** Conexão com o schema de marketing, separada da do núcleo. */
export function getSqlMarketing(): Sql {
  if (globalParaMarketing.__ddSqlMarketing) {
    return globalParaMarketing.__ddSqlMarketing
  }

  const url = process.env.DATABASE_URL_MARKETING
  if (!url) throw new Error('DATABASE_URL_MARKETING precisa estar definida.')

  const parsed = new URL(url)
  const hostname = parsed.hostname
  const port = parsed.port ? Number(parsed.port) : 5432
  const username = decodeURIComponent(parsed.username)

  globalParaMarketing.__ddSqlMarketing = postgres(url, {
    ssl: 'require',
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    password: () => senhaIam(hostname, port, username),
    connection: { statement_timeout: 20_000 },
  })
  return globalParaMarketing.__ddSqlMarketing
}

async function chamarResend(caminho: string, corpo: unknown) {
  const chave = process.env.RESEND_MARKETING_API_KEY
  if (!chave) throw new Error('RESEND_MARKETING_API_KEY ausente')

  const res = await fetch(`https://api.resend.com${caminho}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  })

  const texto = await res.text()
  let dados: Record<string, unknown> | null = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = { raw: texto }
  }

  if (!res.ok) {
    const msg = dados?.message ?? dados?.error ?? `HTTP ${res.status}`
    throw new Error(String(msg))
  }
  return dados
}

/**
 * Dispara um teste de campanha e registra que saiu.
 *
 * Devolve só o que a tela precisa mostrar: deu certo ou o motivo de não ter
 * dado. Nenhum campo do núcleo atravessa por aqui.
 */
export async function dispararTeste(
  campanhaId: number,
  destino: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
    return { ok: false, motivo: 'Informe um e-mail válido para o teste.' }
  }

  const sql = getSqlMarketing()
  const linhas = await sql<{ assunto: string | null; html: string | null }[]>`
    SELECT assunto, html FROM marketing.campanha WHERE id = ${campanhaId}
  `
  const campanha = linhas[0]
  if (!campanha) return { ok: false, motivo: 'Campanha não encontrada.' }
  if (!campanha.assunto?.trim()) {
    return { ok: false, motivo: 'Escreva o assunto antes de mandar o teste.' }
  }

  try {
    const enviado = await chamarResend('/emails', {
      from: REMETENTE,
      to: [destino],
      reply_to: RESPONDER_PARA,
      subject: `[teste] ${campanha.assunto}`,
      // A variável de descadastro só existe dentro de um broadcast; no teste
      // ela vira link morto, e o layout continua o mesmo.
      html: String(campanha.html ?? '').replace(
        '{{{RESEND_UNSUBSCRIBE_URL}}}',
        '#',
      ),
    })

    await sql`
      INSERT INTO marketing.campanha_teste (campanha_id, email, resend_email_id)
      VALUES (${campanhaId}, ${destino}, ${(enviado?.id as string) ?? null})
    `
    return { ok: true }
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro)
    console.error('[marketing] teste não saiu:', motivo)
    return { ok: false, motivo: `Teste não saiu: ${motivo}` }
  }
}
