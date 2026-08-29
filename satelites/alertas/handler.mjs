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
      <section class="card">
        <h2>Abertos</h2>
        <div class="vazio" style="padding:24px 8px">
          <p class="vazio-titulo">Nenhum alerta aberto</p>
          <p class="vazio-texto">O vigia não encontrou nada pendente. Última passagem: ${esc(idadePassagem)}.</p>
        </div>
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
        <h2>Abertos <span class="contagem-selo">${abertos.length}</span></h2>
        ${grupos
          .map(
            (g) => `
          <div class="grupo">
            <h3>${esc(rotulo(g.tipo))}</h3>
            <ul class="lista">
              ${g.lista
                .map((a) => {
                  const novo = !a.notificado_em
                  return `<li>
                    <div class="linha">
                      <span class="selo ${novo ? 'selo-perigo' : 'selo-ok'}">${novo ? 'ainda não notificado' : 'notificado'}</span>
                      <span class="muted">aberto há ${esc(idadeHumana(a.visto_em))}</span>
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
      ? `<section class="card">
          <h2>Resolvidos nas últimas 48h</h2>
          <div class="vazio" style="padding:24px 8px">
            <p class="vazio-titulo">Nada fechado neste período</p>
            <p class="vazio-texto">Quando um alerta for resolvido, ele aparece aqui por 48 horas para conferência.</p>
          </div>
        </section>`
      : `<section class="card">
          <h2>Resolvidos nas últimas 48h <span class="contagem-selo">${resolvidos.length}</span></h2>
          <ul class="lista">
            ${resolvidos
              .map(
                (a) => `<li>
                  <div class="linha">
                    <strong>${esc(rotulo(a.tipo))}</strong>
                    <span class="selo selo-neutro">fechado</span>
                    <span class="muted">há ${esc(idadeHumana(a.resolvido_em))}</span>
                  </div>
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
    ${estiloBase()}
    /* Sem teto: a lista de alertas tem data, origem e detalhe na mesma linha,
       e a 760px cada achado quebrava em tres linhas. */
    h3 { margin: 18px 0 8px; font-size: 14px; font-weight: 590; letter-spacing: -.012em; color: var(--tinta); }
    .grupo + .grupo { margin-top: 8px; }
  </style>
</head>
<body>
  <main>
    <div class="cabeca">
      <div>
        <p class="cabeca-trilha">Operação / Alertas</p>
        <h1 class="cabeca-titulo">Alertas</h1>
      </div>
    </div>
    <section class="card">
      <h2>Quando o vigia passou por aqui</h2>
      <p class="passagem${vigiaParado ? ' passagem-problema' : ''}">${esc(idadePassagem)}</p>
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
