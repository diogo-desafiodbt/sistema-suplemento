import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'
import {
  cookieDoEvento,
  LOGIN_URL,
  verificarSessao,
} from '../comum/sessao.mjs'
import { estiloBase } from '../comum/estilo.mjs'
import { editor, listar, salvar } from './lib-campanhas.mjs'

const HOST = 'desafiodiabetes.c0fsqek8ykxr.us-east-1.rds.amazonaws.com'
const PORT = 5432
const DB = 'clinico'
const USER = 'satelite_comercial'

const LISTA = '/suplementos/admin/painel/comercial'
const POR_PAGINA = 25

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

function metodoECaminho(event) {
  let method =
    event?.requestContext?.http?.method ?? event?.httpMethod ?? 'GET'
  if (method === 'HEAD') method = 'GET'
  const path =
    event?.rawPath ?? event?.path ?? event?.requestContext?.http?.path ?? '/'
  return { method: method.toUpperCase(), path }
}

function parametros(event) {
  const q = event?.queryStringParameters ?? {}
  const busca = typeof q.q === 'string' ? q.q.trim().slice(0, 120) : ''
  const pagina = Math.max(1, Number.parseInt(q.pagina ?? '1', 10) || 1)
  return { busca, pagina }
}

function redirectLogin() {
  return {
    statusCode: 302,
    headers: { Location: LOGIN_URL, 'Content-Type': 'text/html; charset=utf-8' },
    body: '',
  }
}

function notFound() {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Não encontrado</title></head><body><p>Não encontrado.</p></body></html>',
  }
}

function htmlOk(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body,
  }
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function asNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatData(iso) {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

/** Telefone entra no banco só em dígitos; a máscara é de tela. */
function formatTelefone(valor) {
  const d = String(valor ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return d || '—'
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/**
 * O painel é contagem, não pessoa. Roda inteiro no banco e devolve uma linha
 * por categoria — nenhum nome, e-mail ou telefone sai desta consulta.
 */
async function resumoPorCategoria(db) {
  return db`
    SELECT o.codigo,
           o.descricao,
           count(l.id)                                        AS total,
           count(l.id) FILTER (WHERE l.convertido_em IS NOT NULL) AS convertidos,
           count(c.lead_id)                                   AS com_consentimento
    FROM marketing.origem o
    LEFT JOIN marketing.lead l ON l.origem = o.codigo
    LEFT JOIN LATERAL (
      SELECT 1 AS lead_id FROM marketing.consentimento c2
      WHERE c2.lead_id = l.id LIMIT 1
    ) c ON true
    GROUP BY o.codigo, o.descricao
    ORDER BY count(l.id) DESC, o.codigo
  `
}

async function totalSuprimidos(db) {
  const linhas = await db`SELECT count(*) AS n FROM marketing.supressao`
  return asNumber(linhas[0]?.n)
}

/**
 * Lista paginada e pequena. Sem busca, mostra os mais recentes; com busca,
 * filtra por nome ou e-mail. Em nenhum caso devolve a base inteira.
 */
async function listarLeads(db, busca, pagina) {
  const offset = (pagina - 1) * POR_PAGINA
  const termo = busca ? `%${busca}%` : null
  return db`
    SELECT l.id, l.nome, l.email, l.telefone, l.origem, l.origem_detalhe,
           l.captado_em, l.convertido_em,
           (SELECT count(*) FROM marketing.consentimento c WHERE c.lead_id = l.id) > 0
             AS aceita_marketing,
           count(*) OVER() AS total
    FROM marketing.lead l
    WHERE ${termo}::text IS NULL
       OR l.email ILIKE ${termo}
       OR l.nome ILIKE ${termo}
    ORDER BY l.captado_em DESC
    LIMIT ${POR_PAGINA} OFFSET ${offset}
  `
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

function cartoes(resumo, suprimidos) {
  const total = resumo.reduce((s, r) => s + asNumber(r.total), 0)
  const convertidos = resumo.reduce((s, r) => s + asNumber(r.convertidos), 0)

  const porCategoria = resumo
    .map((r) => {
      const n = asNumber(r.total)
      const conv = asNumber(r.convertidos)
      return `<div class="card">
        <p class="card-rotulo">${esc(r.descricao)}</p>
        <p class="num">${n}</p>
        <p class="sub">${conv > 0 ? `${conv} viraram cliente` : 'nenhuma compra ainda'}</p>
      </div>`
    })
    .join('')

  return `<div class="grid">
    <div class="card">
      <p class="card-rotulo">Total de leads</p>
      <p class="num">${total}</p>
      <p class="sub">${convertidos} viraram cliente</p>
    </div>
    ${porCategoria}
    <div class="card">
      <p class="card-rotulo">Descadastrados</p>
      <p class="num">${suprimidos}</p>
      <p class="sub">não recebem mais</p>
    </div>
  </div>`
}

function tabela(leads, busca, pagina, total) {
  if (leads.length === 0) {
    return `<div class="vazio">
      <p class="vazio-titulo">${busca ? 'Nenhum lead encontrado' : 'Nenhum lead ainda'}</p>
      <p class="vazio-texto">${
        busca
          ? 'Nenhum nome ou e-mail bate com essa busca.'
          : 'Os cadastros aparecem aqui assim que alguém se inscrever.'
      }</p>
    </div>`
  }

  const linhas = leads
    .map(
      (l) => `<tr>
        <td>
          <span class="nome">${esc(l.nome ?? '—')}</span>
          <span class="muted">${esc(l.email)}</span>
        </td>
        <td class="mono">${esc(formatTelefone(l.telefone))}</td>
        <td>
          <span class="selo selo-info">${esc(l.origem)}</span>
          ${l.origem_detalhe ? `<span class="muted">${esc(l.origem_detalhe)}</span>` : ''}
        </td>
        <td>${
          l.aceita_marketing
            ? '<span class="selo selo-ok">sim</span>'
            : '<span class="selo selo-neutro">não</span>'
        }</td>
        <td>${
          l.convertido_em
            ? `<span class="selo selo-ok">${esc(formatData(l.convertido_em))}</span>`
            : '<span class="sem-acao">—</span>'
        }</td>
        <td>${esc(formatData(l.captado_em))}</td>
      </tr>`,
    )
    .join('')

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const link = (p) => {
    const sp = []
    if (busca) sp.push(`q=${encodeURIComponent(busca)}`)
    if (p > 1) sp.push(`pagina=${p}`)
    return `${LISTA}${sp.length ? `?${sp.join('&')}` : ''}`
  }

  const navegacao =
    paginas > 1
      ? `<div class="acoes">
          ${pagina > 1 ? `<a class="btn btn-secundario btn-compacto" href="${esc(link(pagina - 1))}">Anterior</a>` : ''}
          <span class="muted">Página ${pagina} de ${paginas}</span>
          ${pagina < paginas ? `<a class="btn btn-secundario btn-compacto" href="${esc(link(pagina + 1))}">Próxima</a>` : ''}
        </div>`
      : ''

  return `<div class="tabela-wrap">
    <table class="tabela">
      <thead>
        <tr>
          <th>Lead</th>
          <th>Telefone</th>
          <th>Categoria</th>
          <th>Aceita marketing</th>
          <th>Virou cliente</th>
          <th>Captado</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>
  ${navegacao}`
}

function pagina(resumo, suprimidos, leads, busca, paginaAtual, total) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Leads</title>
  <style>${estiloBase()}</style>
</head>
<body>
  <main>
    <div class="acoes" style="margin-bottom:18px">
      <a class="btn btn-primario btn-compacto" href="${LISTA}">Leads</a>
      <a class="btn btn-compacto" href="${LISTA}/campanhas">Campanhas</a>
    </div>
    <div class="cabeca">
      <div>
        <p class="cabeca-trilha">Comercial / Leads</p>
        <h1 class="cabeca-titulo">Leads</h1>
      </div>
      <span class="cabeca-meta">${total} ${total === 1 ? 'registro' : 'registros'}</span>
    </div>

    ${cartoes(resumo, suprimidos)}

    <div class="card">
      <form method="GET" action="${LISTA}" class="acoes">
        <input class="config-chave" type="search" name="q" value="${esc(busca)}"
               placeholder="Buscar por nome ou e-mail" aria-label="Buscar lead">
        <button class="btn btn-primario btn-compacto" type="submit">Buscar</button>
        ${busca ? `<a class="btn btn-secundario btn-compacto" href="${LISTA}">Limpar</a>` : ''}
      </form>
    </div>

    <div class="card card-flush">${tabela(leads, busca, paginaAtual, total)}</div>
  </main>
</body>
</html>`
}

const CAMPANHAS = `${LISTA}/campanhas`

export async function handler(event) {
  const sessao = verificarSessao(cookieDoEvento(event))
  if (!sessao) return redirectLogin()
  if (sessao.role !== 'admin') return notFound()

  const { method, path } = metodoECaminho(event)

  if (path.startsWith(CAMPANHAS)) {
    const db = getSql()
    if (method === 'POST' && path === `${CAMPANHAS}/salvar`) {
      return salvar(db, event)
    }
    if (method !== 'GET') return notFound()
    if (path === CAMPANHAS) return listar(db)
    const previaCelular = event?.queryStringParameters?.previa === 'celular'
    const ok = event?.queryStringParameters?.ok ?? null
    if (path === `${CAMPANHAS}/nova`) return editor(db, null, null, previaCelular)

    const resto = path.slice(CAMPANHAS.length + 1)
    const id = Number.parseInt(resto, 10)
    if (!Number.isFinite(id)) return notFound()
    const aviso = event?.queryStringParameters?.aviso ?? null
    return editor(db, id, aviso, previaCelular, ok)
  }

  if (method !== 'GET' || path !== LISTA) return notFound()

  const { busca, pagina: paginaAtual } = parametros(event)
  const db = getSql()

  const [resumo, suprimidos, leads] = await Promise.all([
    resumoPorCategoria(db),
    totalSuprimidos(db),
    listarLeads(db, busca, paginaAtual),
  ])

  const total = leads[0] ? asNumber(leads[0].total) : 0
  return htmlOk(pagina(resumo, suprimidos, leads, busca, paginaAtual, total))
}
