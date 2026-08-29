import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'

const HOST = 'desafiodiabetes.c0fsqek8ykxr.us-east-1.rds.amazonaws.com'
const PORT = 5432
const DB = 'clinico'
const USER = 'captacao_lead'

const MAX_BODY = 4 * 1024

/** Texto integral exibido na caixa — o mesmo da página /especial. */
const TEXTO_CONSENTIMENTO =
  'Aceito receber por e-mail conteúdos, avisos e ofertas do Desafio Diabetes ' +
  'sobre controle e reversão do diabetes.'


/**
 * Códigos aceitos. Precisam existir em `marketing.origem` (chave estrangeira).
 *
 * `exigeConsentimento` separa quem pede para receber de quem só está pedindo
 * outra coisa. No popup da live a pessoa marcou a caixa: consentimento é o
 * motivo do cadastro existir. No quiz ela está pedindo uma recomendação, e o
 * marketing é opcional — o lead grava mesmo sem caixa marcada, e aí não vira
 * público de campanha.
 */
const ORIGEM_PADRAO = 'live-14-09'
const ORIGENS = {
  'live-14-09': { exigeConsentimento: true, coleta: 'popup /especial' },
  'quiz-suplemento': { exigeConsentimento: false, coleta: 'quiz suplementos' },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Só dígitos. DDD + número: 10 para fixo, 11 para celular. */
function telefoneEmDigitos(valor) {
  if (typeof valor !== 'string') return null
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length < 10 || digitos.length > 11) return null
  return digitos
}

/** @type {postgres.Sql | undefined} */
let sql

function getSql() {
  if (sql) return sql
  const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
  const signer = new Signer({
    hostname: HOST,
    port: PORT,
    username: USER,
    region,
  })
  sql = postgres({
    host: HOST,
    port: PORT,
    database: DB,
    username: USER,
    ssl: 'require',
    max: 1,
    idle_timeout: 2,
    connect_timeout: 10,
    connection: {
      statement_timeout: 10_000,
    },
    password: () => signer.getAuthToken(),
  })
  return sql
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }
}

function ok() {
  return json(200, { ok: true })
}

function metodo(event) {
  return (
    event.requestContext?.http?.method ||
    event.httpMethod ||
    ''
  ).toUpperCase()
}

function corpoBruto(event) {
  if (event.body == null) return ''
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8')
  }
  return typeof event.body === 'string' ? event.body : String(event.body)
}

export async function handler(event) {
  const method = metodo(event)
  if (method !== 'POST') {
    console.log(JSON.stringify({ resultado: 'recusado', motivo: 'metodo' }))
    return json(405, { ok: false, error: 'method' })
  }

  const bruto = corpoBruto(event)
  if (Buffer.byteLength(bruto, 'utf8') > MAX_BODY) {
    console.log(JSON.stringify({ resultado: 'recusado', motivo: 'corpo_grande' }))
    return json(413, { ok: false, error: 'payload' })
  }

  let body
  try {
    body = bruto ? JSON.parse(bruto) : null
  } catch {
    console.log(JSON.stringify({ resultado: 'recusado', motivo: 'json' }))
    return json(400, { ok: false, error: 'json' })
  }
  if (!body || typeof body !== 'object') {
    console.log(JSON.stringify({ resultado: 'recusado', motivo: 'json' }))
    return json(400, { ok: false, error: 'json' })
  }

  // Armadilha: bot preenche campos escondidos. Pessoa real deixa vazio.
  if (
    typeof body.sobrenome === 'string' &&
    body.sobrenome.trim() !== ''
  ) {
    console.log(JSON.stringify({ resultado: 'ok', motivo: 'armadilha' }))
    return ok()
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_RE.test(email)) {
    console.log(JSON.stringify({ resultado: 'recusado', motivo: 'email' }))
    return json(400, { ok: false, error: 'email' })
  }

  const nome =
    typeof body.nome === 'string' && body.nome.trim()
      ? body.nome.trim()
      : null
  // A origem NÃO vem livre do navegador: quem escolhesse o valor poderia
  // despejar cadastro em qualquer balde e corromper a segmentação. Só os
  // códigos desta lista entram, e eles precisam existir em `marketing.origem`.
  const origem =
    typeof body.origem === 'string' ? body.origem.trim() : ORIGEM_PADRAO
  const config = ORIGENS[origem]
  if (!config) {
    console.log(JSON.stringify({ resultado: 'recusado', motivo: 'origem' }))
    return json(400, { ok: false, error: 'origem' })
  }

  const aceitaMarketing = body.consentimento === true
  if (config.exigeConsentimento && !aceitaMarketing) {
    console.log(
      JSON.stringify({ resultado: 'recusado', motivo: 'consentimento' }),
    )
    return json(400, { ok: false, error: 'consentimento' })
  }

  // A live é entregue por grupo de WhatsApp, então o telefone é obrigatório
  // nesta captação. Formato errado responde 400 para a pessoa poder corrigir,
  // em vez de sumir com o cadastro em silêncio.
  const telefone = telefoneEmDigitos(body.telefone)
  if (!telefone) {
    console.log(JSON.stringify({ resultado: 'recusado', motivo: 'telefone' }))
    return json(400, { ok: false, error: 'telefone' })
  }

  const origemDetalhe =
    typeof body.origem_detalhe === 'string' && body.origem_detalhe.trim()
      ? body.origem_detalhe.trim().slice(0, 120)
      : null

  try {
    const db = getSql()

    // A única porta. Minúsculas, supressão, conflito de origem e o
    // consentimento append-only acontecem dentro da função — o papel
    // `captacao_lead` não tem privilégio de tabela nenhum para fazer isso aqui.
    //
    // Devolve NULL para e-mail inválido, consentimento vazio ou endereço
    // suprimido. Nos três casos a resposta é 200, igual ao cadastro novo:
    // resposta diferente entregaria uma forma de descobrir quem está na base.
    const linhas = await db`
      SELECT marketing.captar_lead(
        ${email},
        ${nome},
        ${telefone},
        ${origem},
        ${origemDetalhe},
        ${aceitaMarketing ? TEXTO_CONSENTIMENTO : ''},
        ${config.coleta},
        ${aceitaMarketing}
      ) AS id
    `
    const leadId = linhas[0]?.id ?? null

    console.log(
      JSON.stringify({
        resultado: 'ok',
        motivo: leadId ? 'gravado' : 'ignorado',
        origem,
        marketing: aceitaMarketing,
        id: leadId,
      }),
    )

    return ok()
  } catch (error) {
    console.error(
      JSON.stringify({
        resultado: 'erro',
        motivo: error instanceof Error ? error.message : 'desconhecido',
      }),
    )
    return json(500, { ok: false, error: 'interno' })
  }
}
