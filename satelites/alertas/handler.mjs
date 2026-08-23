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
const USER = 'satelite_alertas'

const ROTULOS = {
  'pagamento-sem-pedido': 'Pagamento sem pedido',
  'assinada-sem-despacho': 'Prescrição assinada sem despacho',
  'job-atrasado': 'Rotina atrasada',
  'job-falhou': 'Rotina falhou',
  'suporte-sem-resposta': 'Cliente sem resposta',
  'assinatura-vencida': 'Assinatura vencida',
  'job-preso': 'Rotina presa',
  'inngest-parado': 'Camada assíncrona parada',
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

function minutosDesde(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.floor(ms / 60000))
}

function idadeHumana(iso) {
  const min = minutosDesde(iso)
  if (min == null) return '—'
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = min / 60
  if (h < 24) {
    const arred = h < 10 ? Math.round(h * 10) / 10 : Math.round(h)
    return `${arred} h`
  }
  const d = Math.round(h / 24)
  return `${d} d`
}

function rotulo(tipo) {
  return ROTULOS[tipo] ?? tipo
}

function textoDetalhe(detalhe) {
  if (!detalhe || typeof detalhe !== 'object') return ''
  const partes = []
  if (detalhe.email) partes.push(String(detalhe.email))
  if (detalhe.job) partes.push(String(detalhe.job))
  if (detalhe.valor != null) partes.push(`R$ ${detalhe.valor}`)
  if (detalhe.minutos != null) partes.push(`${detalhe.minutos} min`)
  if (detalhe.horas != null) partes.push(`${detalhe.horas} h`)
  if (detalhe.dias != null) partes.push(`${detalhe.dias} d`)
  if (detalhe.situacao) partes.push(String(detalhe.situacao))
  if (detalhe.status) partes.push(String(detalhe.status))
  if (detalhe.venceu_em) partes.push(`venceu ${detalhe.venceu_em}`)
  if (detalhe.ultima_execucao) partes.push(`última: ${detalhe.ultima_execucao}`)
  if (detalhe.quando) partes.push(String(detalhe.quando))
  if (detalhe.desde) partes.push(`desde ${detalhe.desde}`)
  return partes.join(' · ')
}

function pagina({ ultimaPassagem, abertos, resolvidos }) {
  const minPassagem = minutosDesde(ultimaPassagem)
  const vigiaParado = minPassagem != null && minPassagem > 90
  const idadePassagem = idadeHumana(ultimaPassagem)
  const horasPassagem =
    minPassagem == null ? '—' : (minPassagem / 60).toFixed(minPassagem < 600 ? 1 : 0)

  const porTipo = new Map()
  for (const a of abertos) {
    if (!porTipo.has(a.tipo)) porTipo.set(a.tipo, [])
    porTipo.get(a.tipo).push(a)
  }

  let blocoAbertos
  if (abertos.length === 0) {
    blocoAbertos = `
      <section class="card ok">
        <h2>Abertos</h2>
        <p>Nenhum alerta aberto. Está tudo certo.</p>
        <p class="muted">Última passagem do vigia: ${esc(idadePassagem)}.</p>
      </section>`
  } else {
    const grupos = [...porTipo.entries()]
      .map(([tipo, lista]) => ({
        tipo,
        lista,
        maisAntigo: lista.reduce(
          (acc, x) => (new Date(x.visto_em) < new Date(acc) ? x.visto_em : acc),
          lista[0].visto_em,
        ),
      }))
      .sort((a, b) => new Date(a.maisAntigo) - new Date(b.maisAntigo))

    blocoAbertos = `
      <section class="card">
        <h2>Abertos <span class="count">${abertos.length}</span></h2>
        ${grupos
          .map(
            (g) => `
          <div class="grupo">
            <h3>${esc(rotulo(g.tipo))}</h3>
            <ul>
              ${g.lista
                .map((a) => {
                  const novo = !a.notificado_em
                  return `<li class="${novo ? 'novo' : 'conhecido'}">
                    <div class="linha">
                      <span class="badge">${novo ? 'ainda não notificado' : 'notificado'}</span>
                      <span class="tempo">aberto há ${esc(idadeHumana(a.visto_em))}</span>
                    </div>
                    <p>${esc(textoDetalhe(a.detalhe)) || '<span class="muted">sem detalhe</span>'}</p>
                  </li>`
                })
                .join('')}
            </ul>
          </div>`,
          )
          .join('')}
      </section>`
  }

  const blocoResolvidos =
    resolvidos.length === 0
      ? `<section class="card discreto">
          <h2>Resolvidos nas últimas 48h</h2>
          <p class="muted">Nada fechado neste período.</p>
        </section>`
      : `<section class="card discreto">
          <h2>Resolvidos nas últimas 48h <span class="count">${resolvidos.length}</span></h2>
          <ul class="resolvidos">
            ${resolvidos
              .map(
                (a) => `<li>
                  <strong>${esc(rotulo(a.tipo))}</strong>
                  <span class="muted">fechado há ${esc(idadeHumana(a.resolvido_em))}</span>
                  <p>${esc(textoDetalhe(a.detalhe))}</p>
                </li>`,
              )
              .join('')}
          </ul>
        </section>`

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Alertas</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px 16px;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      color: #212529;
      line-height: 1.45;
      background: transparent;
    }
    main { max-width: 760px; margin: 0 auto; padding: 0 0 24px; }
    .card {
      background: #fff;
      border: 1px solid #e8ecf3;
      border-radius: 16px;
      padding: 20px 22px;
      margin-bottom: 16px;
    }
    h2 { margin: 0 0 12px; font-size: 15px; color: #13244f; }
    h3 { margin: 16px 0 8px; font-size: 13px; color: #13244f; }
    .count {
      font-weight: 600;
      font-size: 12px;
      background: #13244f;
      color: #fff;
      border-radius: 999px;
      padding: 1px 8px;
      margin-left: 6px;
    }
    .passagem { font-size: 28px; font-weight: 700; color: #13244f; margin: 0 0 6px; }
    .passagem.problema { color: #ff7076; }
    .aviso {
      background: #fff6ea;
      color: #8a5a12;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
    }
    .ok p { margin: 0 0 6px; }
    .muted { color: #6c757d; font-size: 13px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 10px 0; border-top: 1px solid #f0f2f7; }
    .grupo ul li:first-child { border-top: 0; }
    .linha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
      border-radius: 999px;
      padding: 2px 8px;
    }
    .novo .badge { background: #fde8e9; color: #b4232c; }
    .conhecido .badge { background: #e8f6e4; color: #2f6b24; }
    .tempo { font-size: 12px; color: #6c757d; }
    li p { margin: 6px 0 0; font-size: 14px; }
    .discreto { opacity: .92; }
    .resolvidos li { font-size: 14px; }
    .resolvidos strong { color: #13244f; margin-right: 8px; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h2>Quando o vigia passou por aqui</h2>
      <p class="passagem${vigiaParado ? ' problema' : ''}">${esc(idadePassagem)}</p>
      ${
        vigiaParado
          ? `<p class="aviso">O vigia não passa por aqui há ${esc(horasPassagem)} horas.</p>`
          : `<p class="muted">${ultimaPassagem ? 'Passagem mais recente entre visto e última vez.' : 'Ainda não há passagem registrada.'}</p>`
      }
    </section>
    ${blocoAbertos}
    ${blocoResolvidos}
  </main>
</body>
</html>`
}

export async function handler(event) {
  const sessao = verificarSessao(cookieDoEvento(event))
  if (!sessao) return redirectLogin()
  if (sessao.role !== 'admin') return notFound()

  const db = getSql()

  const passagemRows = await db`
    SELECT max(greatest(visto_em, ultima_vez_em)) AS ultima_passagem FROM alertas
  `
  const abertos = await db`
    SELECT id, tipo, detalhe, visto_em, ultima_vez_em, notificado_em
    FROM alertas
    WHERE resolvido_em IS NULL
    ORDER BY visto_em ASC
  `
  const resolvidos = await db`
    SELECT id, tipo, detalhe, visto_em, resolvido_em
    FROM alertas
    WHERE resolvido_em IS NOT NULL
      AND resolvido_em >= now() - interval '48 hours'
    ORDER BY resolvido_em DESC
  `

  return htmlOk(
    pagina({
      ultimaPassagem: passagemRows[0]?.ultima_passagem ?? null,
      abertos,
      resolvidos,
    }),
  )
}
