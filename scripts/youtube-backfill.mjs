/**
 * Backfill YouTube Analytics — canal/tráfego 24m, vídeos/dia 12m,
 * recortes 12m, retenção 90d, metadata completa + 1º snapshot.
 *
 * Uso:
 *   node scripts/youtube-backfill.mjs              # tudo
 *   node scripts/youtube-backfill.mjs recortes     # só recortes mensais
 *   node scripts/youtube-backfill.mjs metadata     # só metadata + snapshot
 *   node scripts/youtube-backfill.mjs retencao     # só retenção
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports'
const DATA_API = 'https://www.googleapis.com/youtube/v3'

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function num(v) {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function todaySp(now = new Date()) {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function eachDayInclusive(start, end) {
  const days = []
  let cur = start
  while (cur <= end) {
    days.push(cur)
    cur = addDaysIso(cur, 1)
  }
  return days
}

function monthBounds(mesIso) {
  const start = `${mesIso.slice(0, 7)}-01`
  const [y, m] = start.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${start.slice(0, 7)}-${String(last).padStart(2, '0')}`
  return { start, end }
}

function monthsBack(endIso, count) {
  const months = []
  let y = Number(endIso.slice(0, 4))
  let m = Number(endIso.slice(5, 7))
  for (let i = 0; i < count; i++) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return months.reverse()
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const channelId = requireEnv('YOUTUBE_CHANNEL_ID')
const uploadsPlaylistId = channelId.startsWith('UC')
  ? `UU${channelId.slice(2)}`
  : channelId

let tokenCache = null

async function getAccessToken() {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireEnv('YOUTUBE_CLIENT_ID'),
      client_secret: requireEnv('YOUTUBE_CLIENT_SECRET'),
      refresh_token: requireEnv('YOUTUBE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth → ${res.status}: ${JSON.stringify(data)}`)
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  }
  return data.access_token
}

async function analyticsReport(params) {
  const token = await getAccessToken()
  const url = new URL(ANALYTICS_URL)
  url.searchParams.set('ids', `channel==${channelId}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Analytics → ${res.status}: ${JSON.stringify(data)}`)
  }
  return data
}

function mapRows(data) {
  const headers = data.columnHeaders ?? []
  return (data.rows ?? []).map((row) => {
    const obj = {}
    headers.forEach((h, i) => {
      obj[h.name] = row[i]
    })
    return obj
  })
}

async function upsertBatches(table, rows, onConflict, size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    const { error } = await supabase.from(table).upsert(batch, { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

async function fetchCanal(start, end) {
  const data = await analyticsReport({
    startDate: start,
    endDate: end,
    dimensions: 'day',
    metrics:
      'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,dislikes,comments,shares',
  })
  const synced_at = new Date().toISOString()
  return mapRows(data).map((r) => ({
    dia: String(r.day),
    views: num(r.views),
    minutos_assistidos: num(r.estimatedMinutesWatched),
    duracao_media_segundos: num(r.averageViewDuration),
    percentual_medio_assistido: num(r.averageViewPercentage),
    inscritos_ganhos: num(r.subscribersGained),
    inscritos_perdidos: num(r.subscribersLost),
    likes: num(r.likes),
    dislikes: num(r.dislikes),
    comentarios: num(r.comments),
    compartilhamentos: num(r.shares),
    synced_at,
  }))
}

async function fetchTrafego(start, end) {
  const data = await analyticsReport({
    startDate: start,
    endDate: end,
    dimensions: 'day,insightTrafficSourceType',
    metrics: 'views,estimatedMinutesWatched',
    sort: '-views',
  })
  const synced_at = new Date().toISOString()
  return mapRows(data).map((r) => ({
    dia: String(r.day),
    fonte: String(r.insightTrafficSourceType),
    views: num(r.views),
    minutos_assistidos: num(r.estimatedMinutesWatched),
    synced_at,
  }))
}

async function fetchVideoDay(day) {
  const data = await analyticsReport({
    startDate: day,
    endDate: day,
    dimensions: 'video',
    metrics:
      'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares',
    sort: '-views',
    maxResults: '200',
  })
  const synced_at = new Date().toISOString()
  return mapRows(data).map((r) => ({
    video_id: String(r.video),
    dia: day,
    views: num(r.views),
    minutos_assistidos: num(r.estimatedMinutesWatched),
    duracao_media_segundos: num(r.averageViewDuration),
    percentual_medio_assistido: num(r.averageViewPercentage),
    inscritos_ganhos: num(r.subscribersGained),
    inscritos_perdidos: num(r.subscribersLost),
    likes: num(r.likes),
    comentarios: num(r.comments),
    compartilhamentos: num(r.shares),
    synced_at,
  }))
}

async function fetchRecortes(start, end, mes) {
  const synced_at = new Date().toISOString()
  const demografia = mapRows(
    await analyticsReport({
      startDate: start,
      endDate: end,
      dimensions: 'ageGroup,gender',
      metrics: 'viewerPercentage',
    }),
  ).map((r) => ({
    mes,
    faixa_etaria: String(r.ageGroup),
    genero: String(r.gender),
    percentual: num(r.viewerPercentage),
    synced_at,
  }))
  await sleep(100)

  const geografia = mapRows(
    await analyticsReport({
      startDate: start,
      endDate: end,
      dimensions: 'country',
      metrics: 'views,estimatedMinutesWatched',
      sort: '-views',
    }),
  ).map((r) => ({
    mes,
    pais: String(r.country),
    views: num(r.views),
    minutos_assistidos: num(r.estimatedMinutesWatched),
    synced_at,
  }))
  await sleep(100)

  const termos = mapRows(
    await analyticsReport({
      startDate: start,
      endDate: end,
      dimensions: 'insightTrafficSourceDetail',
      filters: 'insightTrafficSourceType==YT_SEARCH',
      metrics: 'views',
      sort: '-views',
      maxResults: '25',
    }),
  ).map((r) => ({
    mes,
    termo: String(r.insightTrafficSourceDetail),
    views: num(r.views),
    synced_at,
  }))
  await sleep(100)

  const audiencia = []
  for (const r of mapRows(
    await analyticsReport({
      startDate: start,
      endDate: end,
      dimensions: 'subscribedStatus',
      metrics: 'views,estimatedMinutesWatched',
    }),
  )) {
    audiencia.push({
      mes,
      tipo: 'subscribed',
      valor: String(r.subscribedStatus),
      views: num(r.views),
      minutos_assistidos: num(r.estimatedMinutesWatched),
      compartilhamentos: null,
      synced_at,
    })
  }
  await sleep(100)
  for (const r of mapRows(
    await analyticsReport({
      startDate: start,
      endDate: end,
      dimensions: 'deviceType',
      metrics: 'views',
      sort: '-views',
    }),
  )) {
    audiencia.push({
      mes,
      tipo: 'device',
      valor: String(r.deviceType),
      views: num(r.views),
      minutos_assistidos: null,
      compartilhamentos: null,
      synced_at,
    })
  }
  await sleep(100)
  for (const r of mapRows(
    await analyticsReport({
      startDate: start,
      endDate: end,
      dimensions: 'sharingService',
      metrics: 'shares',
      sort: '-shares',
      maxResults: '25',
    }),
  )) {
    audiencia.push({
      mes,
      tipo: 'sharing',
      valor: String(r.sharingService),
      views: null,
      minutos_assistidos: null,
      compartilhamentos: num(r.shares),
      synced_at,
    })
  }

  return { demografia, geografia, termos, audiencia }
}

async function fetchRetencao(videoId, start, end) {
  const data = await analyticsReport({
    startDate: start,
    endDate: end,
    dimensions: 'elapsedVideoTimeRatio',
    metrics: 'audienceWatchRatio,relativeRetentionPerformance',
    filters: `video==${videoId}`,
  })
  const synced_at = new Date().toISOString()
  return mapRows(data)
    .map((r) => {
      const ponto = num(r.elapsedVideoTimeRatio)
      if (ponto == null) return null
      return {
        video_id: videoId,
        ponto,
        audiencia_ratio: num(r.audienceWatchRatio),
        retencao_relativa: num(r.relativeRetentionPerformance),
        periodo_inicio: start,
        periodo_fim: end,
        synced_at,
      }
    })
    .filter(Boolean)
}

async function fetchAllMetadata() {
  const token = await getAccessToken()
  const ids = []
  let pageToken
  do {
    const url = new URL(`${DATA_API}/playlistItems`)
    url.searchParams.set('part', 'contentDetails')
    url.searchParams.set('playlistId', uploadsPlaylistId)
    url.searchParams.set('maxResults', '50')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`playlistItems: ${JSON.stringify(data)}`)
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId)
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  const uniqueIds = Array.from(new Set(ids))
  console.log(
    `  Playlist: ${ids.length} itens → ${uniqueIds.length} ids únicos`,
  )
  const metas = []
  const synced_at = new Date().toISOString()
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50)
    const url = new URL(`${DATA_API}/videos`)
    url.searchParams.set('part', 'snippet,statistics,contentDetails')
    url.searchParams.set('id', batch.join(','))
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`videos: ${JSON.stringify(data)}`)
    for (const item of data.items ?? []) {
      metas.push({
        video_id: String(item.id),
        titulo: item.snippet?.title ?? null,
        descricao: item.snippet?.description ?? null,
        published_at: item.snippet?.publishedAt ?? null,
        duracao: item.contentDetails?.duration ?? null,
        thumbnail_url:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          null,
        view_count: num(item.statistics?.viewCount),
        like_count: num(item.statistics?.likeCount),
        comment_count: num(item.statistics?.commentCount),
        raw_payload: item,
        synced_at,
      })
    }
    if (i + 50 < uniqueIds.length) await sleep(50)
  }
  return dedupeByVideoId(metas)
}

function dedupeByVideoId(rows) {
  const map = new Map()
  for (const row of rows) {
    map.set(row.video_id, row)
  }
  return Array.from(map.values())
}

async function runCanalTrafego(end) {
  console.log('\n[1] Canal diário + tráfego (24 meses)…')
  const canalStart = addDaysIso(end, -24 * 30)
  for (let i = 0; i < 8; i++) {
    const sliceStart = addDaysIso(canalStart, i * 90)
    let sliceEnd = addDaysIso(canalStart, (i + 1) * 90 - 1)
    if (sliceEnd > end) sliceEnd = end
    if (sliceStart > end) break
    console.log(`  Fatia ${i + 1}: ${sliceStart} → ${sliceEnd}`)
    try {
      const canal = await fetchCanal(sliceStart, sliceEnd)
      if (canal.length) await upsertBatches('youtube_canal_diario', canal, 'dia')
      await sleep(150)
      const trafego = await fetchTrafego(sliceStart, sliceEnd)
      if (trafego.length) {
        await upsertBatches('youtube_trafego_diario', trafego, 'dia,fonte')
      }
      console.log(`    canal=${canal.length} trafego=${trafego.length}`)
    } catch (err) {
      console.error(`    ERRO fatia ${i + 1}:`, err.message ?? err)
    }
    await sleep(200)
  }
}

async function runVideoDiario(end) {
  console.log('\n[2] Top 200 vídeos/dia (12 meses)…')
  const failedDays = []
  const videoStart = addDaysIso(end, -12 * 30)
  const days = eachDayInclusive(videoStart, end)
  let videoRowsTotal = 0
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    try {
      const rows = await fetchVideoDay(day)
      if (rows.length) {
        await upsertBatches('youtube_video_diario', rows, 'video_id,dia')
        videoRowsTotal += rows.length
      }
    } catch (err) {
      console.error(`  ERRO ${day}:`, err.message ?? err)
      failedDays.push(day)
    }
    if ((i + 1) % 30 === 0 || i === days.length - 1) {
      console.log(
        `  Progresso: ${i + 1}/${days.length} dias | rows=${videoRowsTotal} | falhas=${failedDays.length}`,
      )
    }
    await sleep(100)
  }
  return failedDays
}

async function runRecortes(end) {
  console.log('\n[3] Recortes mensais (12 meses)…')
  const months = monthsBack(end, 12)
  for (const mes of months) {
    const { start, end: monthEnd } = monthBounds(mes)
    const sliceEnd = monthEnd > end ? end : monthEnd
    console.log(`  Mês ${mes.slice(0, 7)}: ${start} → ${sliceEnd}`)
    try {
      const r = await fetchRecortes(start, sliceEnd, mes)
      if (r.demografia.length) {
        await upsertBatches(
          'youtube_demografia',
          r.demografia,
          'mes,faixa_etaria,genero',
        )
      }
      if (r.geografia.length) {
        await upsertBatches('youtube_geografia', r.geografia, 'mes,pais')
      }
      if (r.termos.length) {
        await upsertBatches('youtube_termos_busca', r.termos, 'mes,termo')
      }
      if (r.audiencia.length) {
        await upsertBatches(
          'youtube_audiencia_recortes',
          r.audiencia,
          'mes,tipo,valor',
        )
      }
      console.log(
        `    demo=${r.demografia.length} geo=${r.geografia.length} termos=${r.termos.length} aud=${r.audiencia.length}`,
      )
    } catch (err) {
      console.error(`    ERRO mês ${mes}:`, err.message ?? err)
    }
    await sleep(200)
  }
}

async function runMetadata(end) {
  console.log('\n[4] Metadata de todos os vídeos + snapshot de hoje…')
  const metas = await fetchAllMetadata()
  await upsertBatches('youtube_videos', metas, 'video_id')
  const capturado = new Date().toISOString()
  const snapshots = dedupeByVideoId(
    metas.map((m) => ({
      video_id: m.video_id,
      dia: end,
      view_count: m.view_count,
      like_count: m.like_count,
      comment_count: m.comment_count,
      capturado_em: capturado,
    })),
  )
  await upsertBatches('youtube_video_snapshot', snapshots, 'video_id,dia')
  console.log(`  videos=${metas.length} snapshot_dia=${end}`)
}

async function runRetencao(end) {
  console.log('\n[5] Curvas de retenção (vídeos publicados nos últimos 90 dias)…')
  const retencaoInicio = addDaysIso(end, -89)
  const { data: recent, error: recentErr } = await supabase
    .from('youtube_videos')
    .select('video_id')
    .gte('published_at', `${retencaoInicio}T00:00:00.000Z`)
  if (recentErr) throw recentErr
  let retencaoTotal = 0
  for (let i = 0; i < (recent ?? []).length; i++) {
    const id = recent[i].video_id
    try {
      const rows = await fetchRetencao(id, retencaoInicio, end)
      if (rows.length) {
        await upsertBatches(
          'youtube_retencao',
          rows,
          'video_id,ponto,periodo_fim',
        )
        retencaoTotal += rows.length
      }
    } catch (err) {
      console.error(`  ERRO retenção ${id}:`, err.message ?? err)
    }
    if ((i + 1) % 10 === 0 || i === recent.length - 1) {
      console.log(`  Progresso retenção: ${i + 1}/${recent.length}`)
    }
    await sleep(100)
  }
  console.log(`  retencao_rows=${retencaoTotal}`)
}

async function main() {
  const stage = process.argv[2] ?? 'all'
  const allowed = new Set(['all', 'recortes', 'metadata', 'retencao'])
  if (!allowed.has(stage)) {
    console.error(
      `Uso: node scripts/youtube-backfill.mjs [all|recortes|metadata|retencao]`,
    )
    process.exit(1)
  }

  const end = todaySp()
  console.log(
    `YouTube backfill — canal ${channelId}, hoje SP=${end}, etapa=${stage}`,
  )

  let failedDays = []

  if (stage === 'all') {
    await runCanalTrafego(end)
    failedDays = await runVideoDiario(end)
    await runRecortes(end)
    await runMetadata(end)
    await runRetencao(end)
  } else if (stage === 'recortes') {
    await runRecortes(end)
  } else if (stage === 'metadata') {
    await runMetadata(end)
  } else if (stage === 'retencao') {
    await runRetencao(end)
  }

  console.log('\n———')
  console.log('Concluído.')
  if (stage === 'all') {
    console.log(`Dias com falha no video/dia (${failedDays.length}):`)
    if (failedDays.length) console.log(failedDays.join(', '))
    else console.log('(nenhum)')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
