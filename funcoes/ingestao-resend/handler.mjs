import { createHmac, timingSafeEqual } from 'node:crypto'
import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'

const HOST = 'desafiodiabetes.c0fsqek8ykxr.us-east-1.rds.amazonaws.com'
const PORT = 5432
const DB = 'clinico'
const USER = 'ingestao_marketing'

const MAX_BODY = 64 * 1024
/** Janela de tolerância do carimbo, para o mesmo evento não ser reenviado dias depois. */
const TOLERANCIA_SEGUNDOS = 5 * 60

/**
 * Eventos que interessam. O que não estiver aqui é aceito com 200 e ignorado —
 * responder erro faria a Resend reenviar para sempre um evento que a gente não
 * quer.
 */
const TIPOS = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
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
    connection: { statement_timeout: 10_000 },
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

function cabecalho(event, nome) {
  const h = event?.headers ?? {}
  const alvo = nome.toLowerCase()
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === alvo) return v
  }
  return undefined
}

/**
 * Assinatura Svix, que é o que a Resend usa.
 *
 * O conteúdo assinado é `id.timestamp.corpo`, com o corpo **exatamente** como
 * chegou — reserializar o JSON muda um espaço e a conta não fecha mais. Por
 * isso a verificação acontece antes de qualquer parse.
 */
function assinaturaConfere(event, corpoBruto) {
  const segredo = process.env.RESEND_WEBHOOK_SECRET
  if (!segredo) return { ok: false, motivo: 'segredo_ausente' }

  const id = cabecalho(event, 'svix-id')
  const carimbo = cabecalho(event, 'svix-timestamp')
  const assinaturas = cabecalho(event, 'svix-signature')
  if (!id || !carimbo || !assinaturas) {
    return { ok: false, motivo: 'cabecalho_ausente' }
  }

  const segundos = Number.parseInt(carimbo, 10)
  if (!Number.isFinite(segundos)) return { ok: false, motivo: 'carimbo' }
  const idade = Math.abs(Math.floor(Date.now() / 1000) - segundos)
  if (idade > TOLERANCIA_SEGUNDOS) return { ok: false, motivo: 'carimbo_velho' }

  const chave = Buffer.from(segredo.replace(/^whsec_/, ''), 'base64')
  const esperada = createHmac('sha256', chave)
    .update(`${id}.${carimbo}.${corpoBruto}`, 'utf8')
    .digest()

  // O cabeçalho traz uma lista separada por espaço, cada item com prefixo de
  // versão (`v1,`). Basta uma bater.
  for (const parte of String(assinaturas).split(' ')) {
    const virgula = parte.indexOf(',')
    const bruta = virgula >= 0 ? parte.slice(virgula + 1) : parte
    let recebida
    try {
      recebida = Buffer.from(bruta, 'base64')
    } catch {
      continue
    }
    if (recebida.length !== esperada.length) continue
    if (timingSafeEqual(recebida, esperada)) return { ok: true }
  }

  return { ok: false, motivo: 'assinatura' }
}

function corpoBruto(event) {
  if (event?.body == null) return ''
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8')
  }
  return typeof event.body === 'string' ? event.body : String(event.body)
}

/**
 * Hard ou soft, para a política de supressão decidir.
 *
 * A Resend não usa um campo só: dependendo do evento vem `bounce.type`,
 * `bounce.subType` ou nada. Na dúvida devolve nulo, que a função do banco
 * trata como soft — e soft não suprime na primeira. Errar para o lado de não
 * suprimir é o lado certo: endereço bom descartado não volta.
 */
function subtipoDoBounce(dados) {
  const b = dados?.bounce ?? {}
  const bruto = String(b.type ?? b.subType ?? b.classification ?? '').toLowerCase()
  if (bruto.includes('hard') || bruto.includes('permanent')) return 'hard'
  if (bruto.includes('soft') || bruto.includes('transient')) return 'soft'
  return null
}

export async function handler(event) {
  const metodo = (
    event?.requestContext?.http?.method ||
    event?.httpMethod ||
    ''
  ).toUpperCase()
  if (metodo !== 'POST') return json(405, { ok: false })

  const bruto = corpoBruto(event)
  if (Buffer.byteLength(bruto, 'utf8') > MAX_BODY) {
    console.log(JSON.stringify({ resultado: 'recusado', motivo: 'corpo_grande' }))
    return json(413, { ok: false })
  }

  const veredito = assinaturaConfere(event, bruto)
  if (!veredito.ok) {
    console.log(
      JSON.stringify({ resultado: 'recusado', motivo: veredito.motivo }),
    )
    return json(401, { ok: false })
  }

  let evento
  try {
    evento = JSON.parse(bruto)
  } catch {
    return json(400, { ok: false })
  }

  const tipo = TIPOS[evento?.type]
  if (!tipo) {
    // 200 de propósito: evento que não interessa não pode ficar em reenvio
    // eterno na fila da Resend.
    console.log(JSON.stringify({ resultado: 'ignorado', tipo: evento?.type }))
    return json(200, { ok: true, ignorado: true })
  }

  const dados = evento?.data ?? {}
  const destinatarios = Array.isArray(dados.to)
    ? dados.to
    : [dados.to].filter(Boolean)

  if (destinatarios.length === 0) {
    console.log(JSON.stringify({ resultado: 'ignorado', motivo: 'sem_destino' }))
    return json(200, { ok: true, ignorado: true })
  }

  const subtipo = tipo === 'bounced' ? subtipoDoBounce(dados) : null
  const quando = evento?.created_at ?? dados?.created_at ?? null

  try {
    const db = getSql()
    let gravados = 0

    // Um e-mail pode ter mais de um destinatário. Cada um vira um evento, com
    // a supressão avaliada por endereço.
    for (const destino of destinatarios) {
      const linhas = await db`
        SELECT marketing.registrar_evento(
          ${tipo},
          ${String(destino)},
          ${subtipo},
          ${dados.email_id ?? null},
          ${dados.broadcast_id ?? null},
          ${quando},
          ${db.json(dados)}
        ) AS id
      `
      if (linhas[0]?.id) gravados += 1
    }

    console.log(
      JSON.stringify({
        resultado: 'ok',
        tipo,
        subtipo,
        destinatarios: destinatarios.length,
        gravados,
      }),
    )
    return json(200, { ok: true })
  } catch (error) {
    console.error(
      JSON.stringify({
        resultado: 'erro',
        tipo,
        motivo: error instanceof Error ? error.message : 'desconhecido',
      }),
    )
    // 500 faz a Resend reenviar, que é o certo quando a falha é nossa.
    return json(500, { ok: false })
  }
}
