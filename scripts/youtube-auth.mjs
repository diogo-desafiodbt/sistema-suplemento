/**
 * Autorização OAuth única do YouTube Analytics.
 * Uso: node scripts/youtube-auth.mjs
 *
 * Sobe um servidor local, imprime a URL de consentimento, captura o code
 * do redirect e troca por um refresh token. Rodar UMA vez — o refresh
 * token gerado vai pro .env.local e serve pro job diário pra sempre.
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const PORT = 8723
const REDIRECT_URI = `http://localhost:${PORT}`
const SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
]

function loadEnv() {
  const content = readFileSync(resolve(root, '.env.local'), 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv()

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} ausente`)
  return value
}

const clientId = requireEnv('YOUTUBE_CLIENT_ID')
const clientSecret = requireEnv('YOUTUBE_CLIENT_SECRET')

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPES.join(' '))
authUrl.searchParams.set('access_type', 'offline')
// force consent — garante que venha refresh_token mesmo se já autorizado antes
authUrl.searchParams.set('prompt', 'consent')

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Troca de code falhou: ${JSON.stringify(data)}`)
  }
  return data
}

/** Valida o token: lista o canal e puxa 1 linha de analytics. */
async function verify(accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` }

  const chRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    { headers },
  )
  const chData = await chRes.json()
  if (!chRes.ok) {
    throw new Error(`channels.list falhou: ${JSON.stringify(chData)}`)
  }
  const channel = chData.items?.[0]
  if (!channel) {
    throw new Error(
      'Nenhum canal retornado — a conta autorizada não é proprietária de um canal.',
    )
  }

  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const anUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  anUrl.searchParams.set('ids', `channel==${channel.id}`)
  anUrl.searchParams.set('startDate', start)
  anUrl.searchParams.set('endDate', end)
  anUrl.searchParams.set(
    'metrics',
    'views,estimatedMinutesWatched,subscribersGained',
  )

  const anRes = await fetch(anUrl.toString(), { headers })
  const anData = await anRes.json()
  if (!anRes.ok) {
    throw new Error(`Analytics falhou: ${JSON.stringify(anData)}`)
  }

  return { channel, analytics: anData, start, end }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<h2>Erro na autorizacao: ${error}</h2>`)
    console.error(`\nAutorização negada: ${error}`)
    server.close()
    process.exit(1)
  }

  if (!code) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<h2>Aguardando autorizacao…</h2>')
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    '<h2>Autorizacao concluida. Pode fechar esta aba e voltar pro terminal.</h2>',
  )

  try {
    const tokens = await exchangeCode(code)

    console.log('\n=== TOKENS ===')
    console.log(`refresh_token: ${tokens.refresh_token ?? '(NÃO VEIO!)'}`)
    console.log(`scope concedido: ${tokens.scope}`)

    const { channel, analytics, start, end } = await verify(tokens.access_token)

    console.log('\n=== CANAL ===')
    console.log(`nome:  ${channel.snippet.title}`)
    console.log(`id:    ${channel.id}`)
    console.log(`inscritos: ${channel.statistics.subscriberCount}`)
    console.log(`vídeos:    ${channel.statistics.videoCount}`)
    console.log(`views totais: ${channel.statistics.viewCount}`)

    console.log(`\n=== ANALYTICS (${start} → ${end}) ===`)
    const cols = analytics.columnHeaders?.map((c) => c.name) ?? []
    const row = analytics.rows?.[0] ?? []
    cols.forEach((c, i) => console.log(`${c}: ${row[i]}`))
    if (!analytics.rows?.length) {
      console.log('(sem linhas — canal sem dados no período)')
    }

    console.log('\n✅ Acesso confirmado. Salve no .env.local:')
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`)
  } catch (err) {
    console.error('\n❌ Falhou:', err.message)
    server.close()
    process.exit(1)
  }

  server.close()
  process.exit(0)
})

server.listen(PORT, () => {
  console.log('Abra esta URL no navegador, LOGADO NA CONTA DONA DO CANAL:\n')
  console.log(authUrl.toString())
  console.log(
    '\n(Se aparecer "App não verificado": Avançado → Acessar (não seguro))',
  )
  console.log('\nAguardando autorização…')
})
