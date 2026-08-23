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
const USER = 'satelite_pedidos'

const ORIGEM = 'https://desafiodiabetes.com'
const LISTA = '/suplementos/admin/pedidos-lista'

const statusLabel = {
  pending: 'Aguardando',
  sent_to_pharmacy: 'Na farmácia',
  dispatched: 'A caminho',
  delivered: 'Entregue',
  failed: 'Falhou',
}

const statusClasse = {
  pending: 'status-pending',
  sent_to_pharmacy: 'status-farmacia',
  dispatched: 'status-caminho',
  delivered: 'status-entregue',
  failed: 'status-falhou',
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
    password: () => signer.getAuthToken(),
  })
  return sql
}

function metodoECaminho(event) {
  let method =
    event?.requestContext?.http?.method ??
    event?.httpMethod ??
    'GET'
  if (method === 'HEAD') method = 'GET'
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

function formatValor(value) {
  return `R$ ${asNumber(value).toFixed(2).replace('.', ',')}`
}

function formatData(iso) {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

function urlAcao(id, acao) {
  return `${ORIGEM}/api/admin/pedidos/${encodeURIComponent(id)}/${acao}`
}

function botoes(order) {
  const canGenerate =
    order.status === 'sent_to_pharmacy' && !order.shipping_request_id
  const hasLabel = !!order.shipping_request_id

  if (!canGenerate && !hasLabel) {
    return '<span class="sem-acao">—</span>'
  }

  const partes = []

  if (canGenerate) {
    partes.push(`<form method="POST" action="${esc(urlAcao(order.id, 'gerar-etiqueta'))}">
      <button type="submit" class="btn btn-primario">Gerar etiqueta agora</button>
    </form>`)
  }

  if (hasLabel) {
    partes.push(`<form method="POST" action="${esc(urlAcao(order.id, 'atualizar-rastreio'))}">
      <button type="submit" class="btn btn-secundario">Atualizar rastreio agora</button>
    </form>`)
    partes.push(`<form method="POST" action="${esc(urlAcao(order.id, 'pdf-etiqueta'))}" target="_blank">
      <button type="submit" class="btn btn-pdf">Baixar PDF da etiqueta</button>
    </form>`)
  }

  return `<div class="acoes">${partes.join('')}</div>`
}

function pagina(pedidos) {
  const linhas =
    pedidos.length === 0
      ? `<tr><td colspan="6" class="vazio">Nenhum pedido registrado.</td></tr>`
      : pedidos
          .map((order) => {
            const classe =
              statusClasse[order.status] ?? 'status-pending'
            const rotulo = statusLabel[order.status] ?? order.status
            return `<tr>
              <td>
                <p class="nome">${esc(order.full_name ?? '—')}</p>
                <p class="codigo">${esc(order.client_code ?? '')}</p>
              </td>
              <td><span class="pill ${classe}">${esc(rotulo)}</span></td>
              <td class="valor">${esc(formatValor(order.total_amount))}</td>
              <td class="rastreio">${esc(order.tracking_code ?? '—')}</td>
              <td class="data">${esc(formatData(order.created_at))}</td>
              <td>${botoes(order)}</td>
            </tr>`
          })
          .join('')

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pedidos</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: #fafbfe;
      color: #212529;
      line-height: 1.45;
    }
    header {
      background: #13244f;
      color: #fff;
      padding: 18px 24px;
    }
    header strong { font-size: 15px; letter-spacing: .04em; }
    header span { opacity: .55; margin-left: 10px; font-size: 13px; }
    main { max-width: 1080px; margin: 0 auto; padding: 24px 16px 48px; }
    .topo { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
    .topo .secao {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: rgba(19, 36, 79, .5);
      margin: 0 0 4px;
    }
    .topo h1 { margin: 0; font-size: 24px; color: #13244f; }
    .topo .contagem { font-size: 14px; color: #6c757d; }
    .card {
      background: #fff;
      border: 1px solid #e8ecf3;
      border-radius: 16px;
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th {
      text-align: left;
      padding: 14px 20px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: rgba(19, 36, 79, .5);
      border-bottom: 1px solid #eef1f6;
    }
    td {
      padding: 16px 20px;
      border-bottom: 1px solid #f5f7fa;
      vertical-align: top;
    }
    tr:hover td { background: rgba(245, 240, 235, .35); }
    .nome { margin: 0; font-weight: 600; color: #13244f; }
    .codigo { margin: 2px 0 0; font-size: 12px; color: #6c757d; }
    .valor { font-weight: 600; color: #13244f; white-space: nowrap; }
    .rastreio { font-family: ui-monospace, monospace; font-size: 12px; color: #6c757d; }
    .data { font-size: 12px; color: #6c757d; white-space: nowrap; }
    .pill {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      border-radius: 999px;
      padding: 4px 10px;
    }
    .status-pending { background: #f0f2f5; color: #495057; }
    .status-farmacia { background: #e8f0fe; color: #1e4fad; }
    .status-caminho { background: #fff6ea; color: #9a6b12; }
    .status-entregue { background: #e8f6e4; color: #2f6b24; }
    .status-falhou { background: #fde8e9; color: #b4232c; }
    .acoes { display: flex; flex-direction: column; gap: 6px; min-width: 10rem; }
    .acoes form { margin: 0; }
    .btn {
      display: block;
      width: 100%;
      border: 0;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
    }
    .btn-primario { background: #13244f; color: #fff; }
    .btn-primario:hover { background: #0e1b3d; }
    .btn-secundario {
      background: #fff;
      color: #13244f;
      border: 1px solid rgba(19, 36, 79, .3);
    }
    .btn-secundario:hover { background: rgba(19, 36, 79, .05); }
    .btn-pdf {
      background: #fff;
      color: #f4001e;
      border: 1px solid rgba(244, 0, 30, .3);
    }
    .btn-pdf:hover { background: rgba(244, 0, 30, .05); }
    .sem-acao { font-size: 12px; color: #ced4da; }
    .vazio { text-align: center; padding: 40px 16px; color: #6c757d; }
  </style>
</head>
<body>
  <header>
    <strong>Desafio Diabetes</strong><span>Pedidos</span>
  </header>
  <main>
    <div class="topo">
      <div>
        <p class="secao">Operações</p>
        <h1>Pedidos</h1>
      </div>
      <span class="contagem">${pedidos.length} registros</span>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Status</th>
            <th>Valor</th>
            <th>Rastreio</th>
            <th>Data</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  </main>
</body>
</html>`
}

async function listarPedidos(db) {
  return db`
    SELECT o.id, o.status, o.created_at, o.tracking_code, o.total_amount,
           o.shipping_request_id, u.full_name, u.email, u.client_code
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
    LIMIT 50
  `
}

export async function handler(event) {
  const sessao = verificarSessao(cookieDoEvento(event))
  if (!sessao) return redirectLogin()
  if (sessao.role !== 'admin') return notFound()

  const { method, path } = metodoECaminho(event)

  if (method !== 'GET' || path !== LISTA) {
    return notFound()
  }

  const db = getSql()
  const pedidos = await listarPedidos(db)
  return htmlOk(pagina(pedidos))
}
