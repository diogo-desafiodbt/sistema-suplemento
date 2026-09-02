import { Signer } from '@aws-sdk/rds-signer'
import postgres from 'postgres'
import {
  cookieDoEvento,
  LOGIN_URL,
  verificarSessao,
} from '../comum/sessao.mjs'
import { estiloBase } from '../comum/estilo.mjs'

const HOST = 'desafiodiabetes.c0fsqek8ykxr.us-east-1.rds.amazonaws.com'
const PORT = 5432
const DB = 'clinico'
const USER = 'satelite_pedidos'

const ORIGEM = 'https://desafiodiabetes.com'
const LISTA = '/suplementos/admin/painel/pedidos'

const statusLabel = {
  pending: 'Aguardando',
  sent_to_pharmacy: 'Na farmácia',
  dispatched: 'A caminho',
  delivered: 'Entregue',
  failed: 'Falhou',
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
  // Era `status === 'sent_to_pharmacy'`, um estado que o sistema não usa
  // mais: pedido nasce `pending` e vai para `dispatched`. Nenhum passava por
  // lá, então o botão nunca aparecia — e pedido cuja etiqueta falhou não
  // tinha como ser retomado por ninguém. O que decide é ter ou não etiqueta.
  // Emitir etiqueta saiu do nosso fluxo em 02/09/2026: quem emite é a
  // Miligrama, dentro da nossa conta da Envie Agora. O botão fica para a
  // exceção — pedido que precise de uma etiqueta emitida à mão.
  const canGenerate =
    !order.shipping_request_id &&
    !order.tracking_code &&
    order.status !== 'cancelled'

  // Rastrear passou a depender do número do objeto, não da nossa requisição:
  // nas etiquetas da farmácia a requisição não nasceu aqui.
  const hasLabel = !!order.shipping_request_id || !!order.tracking_code

  if (!canGenerate && !hasLabel) {
    return '<span class="sem-acao">—</span>'
  }

  const partes = []

  if (canGenerate) {
    partes.push(`<form method="POST" action="${esc(urlAcao(order.id, 'gerar-etiqueta'))}">
      <button type="submit" class="btn btn-primario btn-compacto">Gerar etiqueta agora</button>
    </form>`)
  }

  if (hasLabel) {
    partes.push(`<form method="POST" action="${esc(urlAcao(order.id, 'atualizar-rastreio'))}">
      <button type="submit" class="btn btn-secundario btn-compacto">Atualizar rastreio agora</button>
    </form>`)
    partes.push(`<form method="POST" action="${esc(urlAcao(order.id, 'pdf-etiqueta'))}" target="_blank">
      <button type="submit" class="btn btn-secundario btn-compacto">Baixar PDF da etiqueta</button>
    </form>`)
  }

  return `<div class="acoes-col">${partes.join('')}</div>`
}

function pagina(pedidos) {
  const seloStatus = {
    pending: 'selo-neutro',
    sent_to_pharmacy: 'selo-info',
    dispatched: 'selo-atencao',
    delivered: 'selo-ok',
    failed: 'selo-perigo',
  }

  const corpo =
    pedidos.length === 0
      ? `<div class="vazio">
          <p class="vazio-titulo">Nenhum pedido ainda</p>
          <p class="vazio-texto">O portão de pré-lançamento está fechado. Os pedidos aparecem aqui assim que a loja abrir.</p>
        </div>`
      : `<div class="tabela-wrap">
          <table class="tabela">
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
            <tbody>
              ${pedidos
                .map((order) => {
                  const tom =
                    seloStatus[order.status] ?? 'selo-neutro'
                  const rotulo = statusLabel[order.status] ?? order.status
                  return `<tr>
                    <td>
                      <p class="nome">${esc(order.full_name ?? '—')}</p>
                      <p class="sub">${esc(order.client_code ?? '')}</p>
                    </td>
                    <td><span class="selo ${tom}">${esc(rotulo)}</span></td>
                    <td class="num">${esc(formatValor(order.total_amount))}</td>
                    <td class="mono">${esc(order.tracking_code ?? '—')}</td>
                    <td class="num muted">${esc(formatData(order.created_at))}</td>
                    <td>${botoes(order)}</td>
                  </tr>`
                })
                .join('')}
            </tbody>
          </table>
        </div>`

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pedidos</title>
  <style>${estiloBase()}</style>
</head>
<body>
  <main>
    <div class="cabeca">
      <div>
        <p class="cabeca-trilha">Operação / Pedidos</p>
        <h1 class="cabeca-titulo">Pedidos</h1>
      </div>
      <span class="cabeca-meta">${pedidos.length} registros</span>
    </div>
    <div class="card card-flush">${corpo}</div>
  </main>
</body>
</html>`
}

async function listarPedidos(db) {
  return db`
    SELECT o.id, o.status, o.created_at, o.tracking_code, o.total_amount,
           o.shipping_request_id, u.full_name, u.client_code
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
