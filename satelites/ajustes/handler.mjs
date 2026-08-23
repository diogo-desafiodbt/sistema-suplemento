import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'
import {
  cookieDoEvento,
  LOGIN_URL,
  verificarSessao,
} from '../comum/sessao.mjs'

const HOST = 'desafiodiabetes.c0fsqek8ykxr.us-east-1.rds.amazonaws.com'
const PORT = 5432
const DB = 'clinico'
const USER = 'satelite_ajustes'

const BASE = '/suplementos/admin/painel/ajustes'
// Location precisa ser ABSOLUTO e https. Devolvendo caminho relativo, alguma
// camada entre nós e o navegador completa com o protocolo que ELA recebeu — e
// a CloudFront fala http com o ALB. O resultado era um 302 mandando o
// navegador para http://, rebaixando a conexão e dependendo de outra regra
// para consertar. Aqui não fica implícito.
const ORIGEM = 'https://desafiodiabetes.com'
const abs = (caminho) =>
  caminho.startsWith('http') ? caminho : `${ORIGEM}${caminho}`

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
    password: () => signer.getAuthToken(),
  })
  return sql
}

function metodoECaminho(event) {
  const method =
    event?.requestContext?.http?.method ??
    event?.httpMethod ??
    'GET'
  const path =
    event?.rawPath ??
    event?.path ??
    event?.requestContext?.http?.path ??
    '/'
  return { method: method.toUpperCase(), path }
}

function redirectLogin() {
  return {
    statusCode: 302,
    headers: { Location: LOGIN_URL, 'Content-Type': 'text/html; charset=utf-8' },
    body: '',
  }
}

function redirect303(location) {
  return {
    statusCode: 303,
    headers: { Location: abs(location), 'Content-Type': 'text/html; charset=utf-8' },
    body: '',
  }
}

function redirect302(location) {
  return {
    statusCode: 302,
    headers: { Location: abs(location), 'Content-Type': 'text/html; charset=utf-8' },
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

function htmlErro(status, mensagem) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Erro</title></head><body><p>${esc(mensagem)}</p></body></html>`,
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

function parseFormulario(body, contentType) {
  if (!body) return new URLSearchParams()
  const ct = String(contentType ?? '').toLowerCase()
  if (ct.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(body)
  }
  if (ct.includes('multipart/form-data')) {
    return new URLSearchParams(body)
  }
  return new URLSearchParams(body)
}

function queryDoEvento(event) {
  const raw = event?.rawQueryString ?? ''
  if (raw) return new URLSearchParams(raw)
  const qs = event?.queryStringParameters
  if (qs && typeof qs === 'object') {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(qs)) {
      if (v != null) params.set(k, String(v))
    }
    return params
  }
  return new URLSearchParams()
}

function formatValor(coupon) {
  if (coupon.type === 'percentage') return `${asNumber(coupon.value)}%`
  return `R$ ${asNumber(coupon.value).toFixed(2).replace('.', ',')}`
}

function formatData(iso) {
  if (!iso) return 'Sem limite'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

function validarNovoCupom(dados) {
  const code = String(dados.code ?? '').trim().toUpperCase()
  if (!code) return 'Código obrigatório.'
  if (/\s/.test(code)) return 'Código não pode conter espaços.'

  const type = dados.type
  if (type !== 'percentage' && type !== 'fixed') return 'Tipo inválido.'

  const value = Number(dados.value)
  if (!Number.isFinite(value) || value <= 0) return 'Valor inválido.'

  if (type === 'percentage' && (value < 1 || value > 100)) {
    return 'Percentual deve estar entre 1 e 100.'
  }

  let expiresAt = null
  const rawExp = String(dados.expires_at ?? '').trim()
  if (rawExp) {
    const d = new Date(rawExp)
    if (!Number.isFinite(d.getTime())) return 'Data de validade inválida.'
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    if (d < hoje) return 'Data de validade deve ser no futuro.'
    expiresAt = rawExp
  }

  let maxUses = null
  const rawMax = String(dados.max_uses ?? '').trim()
  if (rawMax) {
    const m = parseInt(rawMax, 10)
    if (!Number.isFinite(m) || m < 1) return 'Máximo de usos inválido.'
    maxUses = m
  }

  return { code, type, value, expires_at: expiresAt, max_uses: maxUses }
}

// Cupons e Config são DUAS ABAS DA CASCA, servidas pelo mesmo satélite. A
// barra que troca entre elas é do admin, não daqui — desenhar uma segunda por
// dentro cria dois menus concorrentes na mesma tela.
//
// Continua existindo para quando a página é aberta direto pelo endereço, sem a
// moldura: aí não há barra nenhuma e a pessoa ficaria sem saída. Dentro do
// quadro, some.
function nav(abasAtiva, dentroDaMoldura) {
  if (dentroDaMoldura) return ''
  const tabs = [
    { label: 'Cupons', href: `${BASE}/cupons`, id: 'cupons' },
    { label: 'Config', href: `${BASE}/config`, id: 'config' },
  ]
  return `<nav class="tabs">
    ${tabs
      .map(
        (t) =>
          `<a href="${esc(t.href)}" class="${t.id === abasAtiva ? 'ativa' : ''}">${esc(t.label)}</a>`,
      )
      .join('')}
  </nav>`
}

function estilos() {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px 16px;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      color: #212529;
      line-height: 1.45;
      background: transparent;
    }
    .tabs {
      background: #fff;
      border-bottom: 1px solid #e8ecf3;
      padding: 10px 24px;
      display: flex;
      gap: 6px;
      overflow-x: auto;
    }
    .tabs a {
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      color: rgba(19, 36, 79, .6);
      text-decoration: none;
      white-space: nowrap;
    }
    .tabs a:hover { background: rgba(19, 36, 79, .08); color: #13244f; }
    .tabs a.ativa { background: #13244f; color: #fff; }
    main { max-width: 960px; margin: 0 auto; padding: 0 0 24px; }
    main.estreito { max-width: 640px; }
    .topo { margin-bottom: 20px; }
    .topo .secao {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: rgba(19, 36, 79, .5);
      margin: 0 0 4px;
    }
    .topo h1 { margin: 0; font-size: 24px; color: #13244f; }
    .topo p { margin: 4px 0 0; font-size: 14px; color: #6c757d; }
    .card {
      background: #fff;
      border: 1px solid #e8ecf3;
      border-radius: 16px;
      padding: 20px 22px;
      margin-bottom: 16px;
    }
    .card h2 {
      margin: 0 0 14px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: rgba(19, 36, 79, .5);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: rgba(19, 36, 79, .6);
      margin-bottom: 4px;
    }
    input, select {
      width: 100%;
      border: 1px solid #e0e4ec;
      border-radius: 12px;
      padding: 8px 12px;
      font-size: 14px;
      color: #13244f;
      background: #fff;
    }
    input:focus, select:focus {
      outline: none;
      box-shadow: 0 0 0 2px rgba(19, 36, 79, .15);
    }
    .btn {
      display: inline-block;
      border: 0;
      border-radius: 999px;
      padding: 10px 22px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-primario { background: #f4001e; color: #fff; }
    .btn-primario:hover { background: #a30000; }
    .btn-secundario {
      background: #fff;
      color: #13244f;
      border: 1px solid #e0e4ec;
    }
    .acoes { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th {
      text-align: left;
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: rgba(19, 36, 79, .5);
      border-bottom: 1px solid #eef1f6;
    }
    td {
      padding: 14px 16px;
      border-bottom: 1px solid #f5f7fa;
      vertical-align: middle;
    }
    tr:hover td { background: rgba(245, 240, 235, .35); }
    .mono { font-family: ui-monospace, monospace; font-weight: 700; color: #13244f; }
    .pill {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      border-radius: 999px;
      padding: 4px 10px;
      border: 0;
      cursor: pointer;
    }
    .pill-ativo { background: #e8f6e4; color: #2f6b24; }
    .pill-inativo { background: #f0f2f5; color: #6c757d; }
    .muted { color: #6c757d; font-size: 13px; }
    .flash-ok {
      background: #e8f6e4;
      color: #2f6b24;
      border-radius: 10px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .flash-erro {
      background: #fde8e9;
      color: #b4232c;
      border-radius: 10px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .config-item { margin-bottom: 12px; }
    .config-item:last-child { margin-bottom: 0; }
    .config-chave {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: rgba(19, 36, 79, .5);
      margin: 0 0 4px;
    }
    .config-linha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .config-linha input { flex: 1; min-width: 200px; font-family: ui-monospace, monospace; }
    .vazio { text-align: center; padding: 32px 16px; color: #6c757d; }
  `
}

// O navegador diz para que serve a requisição. `iframe` significa que estamos
// dentro da moldura do admin — e aí a barra de abas é dela, não nossa.
let DENTRO_DA_MOLDURA = false
export function marcarMoldura(event) {
  const h = event?.headers ?? {}
  const dest = h['sec-fetch-dest'] ?? h['Sec-Fetch-Dest'] ?? ''
  DENTRO_DA_MOLDURA = dest === 'iframe'
}

function layout({ titulo, aba, estreito, conteudo }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(titulo)}</title>
  <style>${estilos()}</style>
</head>
<body>
  ${nav(aba, DENTRO_DA_MOLDURA)}
  <main class="${estreito ? 'estreito' : ''}">
    ${conteudo}
  </main>
</body>
</html>`
}

function flash(query) {
  if (query.get('ok') === '1') {
    return '<div class="flash-ok">Salvo com sucesso.</div>'
  }
  const erro = query.get('erro')
  if (erro) {
    return `<div class="flash-erro">${esc(erro)}</div>`
  }
  return ''
}

function paginaCupons(cupons, query) {
  const linhas =
    cupons.length === 0
      ? `<tr><td colspan="6" class="vazio">Nenhum cupom cadastrado.</td></tr>`
      : cupons
          .map((c) => {
            const ativo = c.is_active
            return `<tr>
              <td class="mono">${esc(c.code)}</td>
              <td class="muted">${c.type === 'percentage' ? 'Percentual' : 'Valor fixo'}</td>
              <td><strong>${esc(formatValor(c))}</strong></td>
              <td class="muted">${esc(c.used_count)} / ${c.max_uses ?? '∞'}</td>
              <td class="muted">${esc(formatData(c.expires_at))}</td>
              <td>
                <form method="POST" action="${BASE}/cupons">
                  <input type="hidden" name="acao" value="alternar">
                  <input type="hidden" name="id" value="${esc(c.id)}">
                  <button type="submit" class="pill ${ativo ? 'pill-ativo' : 'pill-inativo'}">${ativo ? 'Ativo' : 'Inativo'}</button>
                </form>
              </td>
            </tr>`
          })
          .join('')

  const conteudo = `
    ${flash(query)}
    <div class="topo">
      <p class="secao">Marketing</p>
      <h1>Cupons de desconto</h1>
      <p class="muted">${cupons.length} cupons</p>
    </div>

    <form method="POST" action="${BASE}/cupons" class="card">
      <h2>Novo cupom</h2>
      <input type="hidden" name="acao" value="criar">
      <div class="grid">
        <div>
          <label for="code">Código</label>
          <input id="code" name="code" type="text" placeholder="EX: DESCONTO10" required>
        </div>
        <div>
          <label for="type">Tipo</label>
          <select id="type" name="type">
            <option value="percentage">Percentual (%)</option>
            <option value="fixed">Valor fixo (R$)</option>
          </select>
        </div>
        <div>
          <label for="value">Valor</label>
          <input id="value" name="value" type="number" min="0" step="0.01" required>
        </div>
        <div>
          <label for="max_uses">Máx. de usos</label>
          <input id="max_uses" name="max_uses" type="number" min="1" placeholder="Ilimitado">
        </div>
        <div>
          <label for="expires_at">Validade</label>
          <input id="expires_at" name="expires_at" type="date">
        </div>
      </div>
      <div class="acoes">
        <button type="submit" class="btn btn-primario">Criar cupom</button>
      </div>
    </form>

    <div class="card" style="padding:0; overflow:hidden;">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Tipo</th>
            <th>Valor</th>
            <th>Usos</th>
            <th>Validade</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`

  return layout({ titulo: 'Cupons', aba: 'cupons', estreito: false, conteudo })
}

function paginaConfig(configs, query) {
  const bloco =
    configs.length === 0
      ? '<div class="card vazio">Nenhuma configuração encontrada.</div>'
      : configs
          .map(
            (c) => `
        <div class="card config-item">
          <p class="config-chave">${esc(c.key)}</p>
          ${c.description ? `<p class="muted">${esc(c.description)}</p>` : ''}
          <form method="POST" action="${BASE}/config" class="config-linha">
            <input type="hidden" name="key" value="${esc(c.key)}">
            <input type="text" name="value" value="${esc(c.value)}" required>
            <button type="submit" class="btn btn-primario">Salvar</button>
          </form>
        </div>`,
          )
          .join('')

  const conteudo = `
    ${flash(query)}
    <div class="topo">
      <p class="secao">Sistema</p>
      <h1>Configurações</h1>
      <p>Valores operacionais editáveis sem redeploy.</p>
    </div>
    ${bloco}`

  return layout({ titulo: 'Configurações', aba: 'config', estreito: true, conteudo })
}

async function listarCupons(db) {
  return db`
    SELECT id, code, type, value, expires_at, max_uses, used_count, is_active
    FROM discount_coupons
    ORDER BY created_at DESC
  `
}

async function listarConfig(db) {
  return db`
    SELECT key, value, description
    FROM system_config
    ORDER BY key ASC
  `
}

async function tratarGetCupons(db, query) {
  const cupons = await listarCupons(db)
  return htmlOk(paginaCupons(cupons, query))
}

async function tratarPostCupons(db, form) {
  const acao = form.get('acao')

  if (acao === 'alternar') {
    const id = String(form.get('id') ?? '').trim()
    if (!id) {
      return redirect303(`${BASE}/cupons?erro=${encodeURIComponent('Cupom inválido.')}`)
    }

    const rows = await db`
      SELECT id, is_active FROM discount_coupons WHERE id = ${id}::uuid LIMIT 1
    `
    if (rows.length === 0) {
      return redirect303(`${BASE}/cupons?erro=${encodeURIComponent('Cupom não encontrado.')}`)
    }

    await db`
      UPDATE discount_coupons
      SET is_active = ${!rows[0].is_active}
      WHERE id = ${id}::uuid
    `
    return redirect303(`${BASE}/cupons?ok=1`)
  }

  if (acao === 'criar') {
    const validado = validarNovoCupom({
      code: form.get('code'),
      type: form.get('type'),
      value: form.get('value'),
      expires_at: form.get('expires_at'),
      max_uses: form.get('max_uses'),
    })

    if (typeof validado === 'string') {
      return redirect303(`${BASE}/cupons?erro=${encodeURIComponent(validado)}`)
    }

    try {
      await db`
        INSERT INTO discount_coupons (
          code, type, value, expires_at, max_uses, used_count, is_active
        )
        VALUES (
          ${validado.code}, ${validado.type}, ${validado.value},
          ${validado.expires_at}, ${validado.max_uses}, 0, true
        )
      `
      return redirect303(`${BASE}/cupons?ok=1`)
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.code === '23505') {
        return redirect303(
          `${BASE}/cupons?erro=${encodeURIComponent('Já existe um cupom com esse código.')}`,
        )
      }
      console.error('Erro ao criar cupom:', error)
      return redirect303(
        `${BASE}/cupons?erro=${encodeURIComponent('Erro ao criar cupom.')}`,
      )
    }
  }

  return redirect303(`${BASE}/cupons?erro=${encodeURIComponent('Ação inválida.')}`)
}

async function tratarGetConfig(db, query) {
  const configs = await listarConfig(db)
  return htmlOk(paginaConfig(configs, query))
}

async function tratarPostConfig(db, form) {
  const key = String(form.get('key') ?? '').trim()
  const value = String(form.get('value') ?? '')

  if (!key) {
    return htmlErro(400, 'Chave obrigatória.')
  }
  if (!value.trim()) {
    return redirect303(`${BASE}/config?erro=${encodeURIComponent('Valor obrigatório.')}`)
  }

  const existe = await db`
    SELECT key FROM system_config WHERE key = ${key} LIMIT 1
  `
  if (existe.length === 0) {
    return htmlErro(400, 'Chave desconhecida.')
  }

  await db`
    UPDATE system_config
    SET value = ${value}
    WHERE key = ${key}
  `

  return redirect303(`${BASE}/config?ok=1`)
}

export async function handler(event) {
  marcarMoldura(event)
  const sessao = verificarSessao(cookieDoEvento(event))
  if (!sessao) return redirectLogin()
  if (sessao.role !== 'admin') return notFound()

  let { method, path } = metodoECaminho(event)
  if (method === 'HEAD') method = 'GET'
  const query = queryDoEvento(event)

  if (method === 'GET' && (path === BASE || path === `${BASE}/`)) {
    return redirect302(`${BASE}/cupons`)
  }

  const db = getSql()

  if (method === 'GET' && path === `${BASE}/cupons`) {
    return tratarGetCupons(db, query)
  }

  if (method === 'POST' && path === `${BASE}/cupons`) {
    let body = event.body ?? ''
    if (event.isBase64Encoded && body) {
      body = Buffer.from(body, 'base64').toString('utf8')
    }
    const form = parseFormulario(
      body,
      event.headers?.['content-type'] ?? event.headers?.['Content-Type'],
    )
    return tratarPostCupons(db, form)
  }

  if (method === 'GET' && path === `${BASE}/config`) {
    return tratarGetConfig(db, query)
  }

  if (method === 'POST' && path === `${BASE}/config`) {
    let body = event.body ?? ''
    if (event.isBase64Encoded && body) {
      body = Buffer.from(body, 'base64').toString('utf8')
    }
    const form = parseFormulario(
      body,
      event.headers?.['content-type'] ?? event.headers?.['Content-Type'],
    )
    return tratarPostConfig(db, form)
  }

  return notFound()
}
