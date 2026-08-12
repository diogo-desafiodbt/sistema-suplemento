const ANALYTICS_URL =
  'https://youtubeanalytics.googleapis.com/v2/reports'
const DATA_API = 'https://www.googleapis.com/youtube/v3'

type TokenCache = { token: string; expiresAt: number }
let tokenCache: TokenCache | null = null

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} ausente`)
  return value
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function channelId(): string {
  return requireEnv('YOUTUBE_CHANNEL_ID')
}

/** Playlist de uploads = channel id com UC → UU. */
export function uploadsPlaylistId(channel = channelId()): string {
  if (channel.startsWith('UC')) return `UU${channel.slice(2)}`
  return channel
}

/** YYYY-MM-DD no calendário America/Sao_Paulo. */
export function todaySp(now = new Date()): string {
  const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return sp.toISOString().slice(0, 10)
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Lista de dias inclusivos entre start e end (YYYY-MM-DD). */
export function eachDayInclusive(start: string, end: string): string[] {
  const days: string[] = []
  let cur = start
  while (cur <= end) {
    days.push(cur)
    cur = addDaysIso(cur, 1)
  }
  return days
}

/** Primeiro e último dia do mês (mês = YYYY-MM-01). */
export function monthBounds(mesIso: string): { start: string; end: string } {
  const start = mesIso.slice(0, 7) + '-01'
  const [y, m] = start.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${start.slice(0, 7)}-${String(last).padStart(2, '0')}`
  return { start, end }
}

export function currentMonthStart(now = new Date()): string {
  return `${todaySp(now).slice(0, 7)}-01`
}

type AnalyticsResponse = {
  columnHeaders?: Array<{ name: string; columnType?: string; dataType?: string }>
  rows?: unknown[][]
}

function rowToObject(
  headers: Array<{ name: string }>,
  row: unknown[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  headers.forEach((h, i) => {
    obj[h.name] = row[i]
  })
  return obj
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export async function getYouTubeAccessToken(): Promise<string> {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token
  }

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

  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
  }

  if (!res.ok || !data.access_token) {
    throw new Error(
      `YouTube OAuth → ${res.status}: ${JSON.stringify(data)}`,
    )
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  }
  return data.access_token
}

export async function analyticsReport(
  params: Record<string, string>,
): Promise<AnalyticsResponse> {
  const token = await getYouTubeAccessToken()
  const url = new URL(ANALYTICS_URL)
  url.searchParams.set('ids', `channel==${channelId()}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    /* keep */
  }

  if (!res.ok) {
    throw new Error(
      `YouTube Analytics → ${res.status}: ${typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed)}`,
    )
  }

  return (parsed ?? {}) as AnalyticsResponse
}

function mapRows(data: AnalyticsResponse): Record<string, unknown>[] {
  const headers = data.columnHeaders ?? []
  const rows = data.rows ?? []
  return rows.map((row) => rowToObject(headers, row))
}

export type CanalDiarioRow = {
  dia: string
  views: number | null
  minutos_assistidos: number | null
  duracao_media_segundos: number | null
  percentual_medio_assistido: number | null
  inscritos_ganhos: number | null
  inscritos_perdidos: number | null
  likes: number | null
  dislikes: number | null
  comentarios: number | null
  compartilhamentos: number | null
  synced_at: string
}

export async function fetchCanalDiario(
  startDate: string,
  endDate: string,
): Promise<CanalDiarioRow[]> {
  const data = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'day',
    metrics:
      'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,dislikes,comments,shares',
  })
  const now = new Date().toISOString()
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
    synced_at: now,
  }))
}

export type VideoDiarioRow = {
  video_id: string
  dia: string
  views: number | null
  minutos_assistidos: number | null
  duracao_media_segundos: number | null
  percentual_medio_assistido: number | null
  inscritos_ganhos: number | null
  inscritos_perdidos: number | null
  likes: number | null
  comentarios: number | null
  compartilhamentos: number | null
  synced_at: string
}

/** Top 200 vídeos de UM dia (startDate === endDate). */
export async function fetchVideoDiarioForDay(
  day: string,
): Promise<VideoDiarioRow[]> {
  const data = await analyticsReport({
    startDate: day,
    endDate: day,
    dimensions: 'video',
    metrics:
      'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares',
    sort: '-views',
    maxResults: '200',
  })
  const now = new Date().toISOString()
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
    synced_at: now,
  }))
}

export type TrafegoDiarioRow = {
  dia: string
  fonte: string
  views: number | null
  minutos_assistidos: number | null
  synced_at: string
}

export async function fetchTrafegoDiario(
  startDate: string,
  endDate: string,
): Promise<TrafegoDiarioRow[]> {
  const data = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'day,insightTrafficSourceType',
    metrics: 'views,estimatedMinutesWatched',
    sort: '-views',
  })
  const now = new Date().toISOString()
  return mapRows(data).map((r) => ({
    dia: String(r.day),
    fonte: String(r.insightTrafficSourceType),
    views: num(r.views),
    minutos_assistidos: num(r.estimatedMinutesWatched),
    synced_at: now,
  }))
}

export type VideoMetaRow = {
  video_id: string
  titulo: string | null
  descricao: string | null
  published_at: string | null
  duracao: string | null
  thumbnail_url: string | null
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  raw_payload: unknown
  synced_at: string
}

export type VideoSnapshotRow = {
  video_id: string
  dia: string
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  capturado_em: string
}

async function listAllUploadVideoIds(): Promise<string[]> {
  const token = await getYouTubeAccessToken()
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${DATA_API}/playlistItems`)
    url.searchParams.set('part', 'contentDetails')
    url.searchParams.set('playlistId', uploadsPlaylistId())
    url.searchParams.set('maxResults', '50')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await res.json()) as {
      items?: Array<{ contentDetails?: { videoId?: string } }>
      nextPageToken?: string
      error?: unknown
    }
    if (!res.ok) {
      throw new Error(
        `YouTube playlistItems → ${res.status}: ${JSON.stringify(data)}`,
      )
    }
    for (const item of data.items ?? []) {
      const id = item.contentDetails?.videoId
      if (id) ids.push(id)
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return Array.from(new Set(ids))
}

async function fetchVideosByIds(ids: string[]): Promise<VideoMetaRow[]> {
  if (ids.length === 0) return []
  const token = await getYouTubeAccessToken()
  const url = new URL(`${DATA_API}/videos`)
  url.searchParams.set('part', 'snippet,statistics,contentDetails')
  url.searchParams.set('id', ids.join(','))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = (await res.json()) as {
    items?: Array<{
      id?: string
      snippet?: {
        title?: string
        description?: string
        publishedAt?: string
        thumbnails?: { high?: { url?: string }; medium?: { url?: string } }
      }
      contentDetails?: { duration?: string }
      statistics?: {
        viewCount?: string
        likeCount?: string
        commentCount?: string
      }
    }>
    error?: unknown
  }
  if (!res.ok) {
    throw new Error(
      `YouTube videos → ${res.status}: ${JSON.stringify(data)}`,
    )
  }

  const now = new Date().toISOString()
  return (data.items ?? []).map((item) => ({
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
    synced_at: now,
  }))
}

/** Metadata de todos os vídeos do canal (+ dados pra snapshot). */
export async function fetchAllVideoMetadata(): Promise<VideoMetaRow[]> {
  const ids = await listAllUploadVideoIds()
  const all: VideoMetaRow[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    all.push(...(await fetchVideosByIds(batch)))
    if (i + 50 < ids.length) await sleep(50)
  }
  // Cinto: última ocorrência ganha se ainda houver duplicata.
  return dedupeByVideoId(all)
}

/** Mantém a última ocorrência de cada video_id (seguro pra upsert ON CONFLICT). */
export function dedupeByVideoId<T extends { video_id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of rows) {
    map.set(row.video_id, row)
  }
  return Array.from(map.values())
}

export function metasToSnapshots(
  metas: VideoMetaRow[],
  dia: string,
): VideoSnapshotRow[] {
  const capturado = new Date().toISOString()
  return metas.map((m) => ({
    video_id: m.video_id,
    dia,
    view_count: m.view_count,
    like_count: m.like_count,
    comment_count: m.comment_count,
    capturado_em: capturado,
  }))
}

export type DemografiaRow = {
  mes: string
  faixa_etaria: string
  genero: string
  percentual: number | null
  synced_at: string
}

export async function fetchDemografia(
  startDate: string,
  endDate: string,
  mes: string,
): Promise<DemografiaRow[]> {
  const data = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'ageGroup,gender',
    metrics: 'viewerPercentage',
  })
  const now = new Date().toISOString()
  return mapRows(data).map((r) => ({
    mes,
    faixa_etaria: String(r.ageGroup),
    genero: String(r.gender),
    percentual: num(r.viewerPercentage),
    synced_at: now,
  }))
}

export type GeografiaRow = {
  mes: string
  pais: string
  views: number | null
  minutos_assistidos: number | null
  synced_at: string
}

export async function fetchGeografia(
  startDate: string,
  endDate: string,
  mes: string,
): Promise<GeografiaRow[]> {
  const data = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'country',
    metrics: 'views,estimatedMinutesWatched',
    sort: '-views',
  })
  const now = new Date().toISOString()
  return mapRows(data).map((r) => ({
    mes,
    pais: String(r.country),
    views: num(r.views),
    minutos_assistidos: num(r.estimatedMinutesWatched),
    synced_at: now,
  }))
}

export type TermoBuscaRow = {
  mes: string
  termo: string
  views: number | null
  synced_at: string
}

export async function fetchTermosBusca(
  startDate: string,
  endDate: string,
  mes: string,
): Promise<TermoBuscaRow[]> {
  const data = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'insightTrafficSourceDetail',
    filters: 'insightTrafficSourceType==YT_SEARCH',
    metrics: 'views',
    sort: '-views',
    maxResults: '25',
  })
  const now = new Date().toISOString()
  return mapRows(data).map((r) => ({
    mes,
    termo: String(r.insightTrafficSourceDetail),
    views: num(r.views),
    synced_at: now,
  }))
}

export type AudienciaRecorteRow = {
  mes: string
  tipo: string
  valor: string
  views: number | null
  minutos_assistidos: number | null
  compartilhamentos: number | null
  synced_at: string
}

export async function fetchAudienciaRecortes(
  startDate: string,
  endDate: string,
  mes: string,
): Promise<AudienciaRecorteRow[]> {
  const now = new Date().toISOString()
  const rows: AudienciaRecorteRow[] = []

  const subscribed = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'subscribedStatus',
    metrics: 'views,estimatedMinutesWatched',
  })
  for (const r of mapRows(subscribed)) {
    rows.push({
      mes,
      tipo: 'subscribed',
      valor: String(r.subscribedStatus),
      views: num(r.views),
      minutos_assistidos: num(r.estimatedMinutesWatched),
      compartilhamentos: null,
      synced_at: now,
    })
  }

  await sleep(100)
  const devices = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'deviceType',
    metrics: 'views',
    sort: '-views',
  })
  for (const r of mapRows(devices)) {
    rows.push({
      mes,
      tipo: 'device',
      valor: String(r.deviceType),
      views: num(r.views),
      minutos_assistidos: null,
      compartilhamentos: null,
      synced_at: now,
    })
  }

  await sleep(100)
  const sharing = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'sharingService',
    metrics: 'shares',
    sort: '-shares',
    maxResults: '25',
  })
  for (const r of mapRows(sharing)) {
    rows.push({
      mes,
      tipo: 'sharing',
      valor: String(r.sharingService),
      views: null,
      minutos_assistidos: null,
      compartilhamentos: num(r.shares),
      synced_at: now,
    })
  }

  return rows
}

export type RetencaoRow = {
  video_id: string
  ponto: number
  audiencia_ratio: number | null
  retencao_relativa: number | null
  periodo_inicio: string
  periodo_fim: string
  synced_at: string
}

export async function fetchRetencaoVideo(
  videoId: string,
  startDate: string,
  endDate: string,
): Promise<RetencaoRow[]> {
  const data = await analyticsReport({
    startDate,
    endDate,
    dimensions: 'elapsedVideoTimeRatio',
    metrics: 'audienceWatchRatio,relativeRetentionPerformance',
    filters: `video==${videoId}`,
  })
  const now = new Date().toISOString()
  return mapRows(data)
    .map((r) => {
      const ponto = num(r.elapsedVideoTimeRatio)
      if (ponto == null) return null
      return {
        video_id: videoId,
        ponto,
        audiencia_ratio: num(r.audienceWatchRatio),
        retencao_relativa: num(r.relativeRetentionPerformance),
        periodo_inicio: startDate,
        periodo_fim: endDate,
        synced_at: now,
      }
    })
    .filter((r): r is RetencaoRow => r !== null)
}

/** Sync completo dos recortes mensais (demografia/geo/termos/audiência). */
export async function fetchRecortesMensais(
  startDate: string,
  endDate: string,
  mes: string,
): Promise<{
  demografia: DemografiaRow[]
  geografia: GeografiaRow[]
  termos: TermoBuscaRow[]
  audiencia: AudienciaRecorteRow[]
}> {
  const demografia = await fetchDemografia(startDate, endDate, mes)
  await sleep(100)
  const geografia = await fetchGeografia(startDate, endDate, mes)
  await sleep(100)
  const termos = await fetchTermosBusca(startDate, endDate, mes)
  await sleep(100)
  const audiencia = await fetchAudienciaRecortes(startDate, endDate, mes)
  return { demografia, geografia, termos, audiencia }
}
