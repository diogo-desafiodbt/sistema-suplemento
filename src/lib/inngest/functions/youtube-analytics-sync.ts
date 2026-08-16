import { getSql } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  addDaysIso,
  currentMonthStart,
  dedupeByVideoId,
  eachDayInclusive,
  fetchAllVideoMetadata,
  fetchCanalDiario,
  fetchRecortesMensais,
  fetchRetencaoVideo,
  fetchTrafegoDiario,
  fetchVideoDiarioForDay,
  metasToSnapshots,
  monthBounds,
  todaySp,
} from '@/lib/youtube/client'
import { inngest } from '../client'

// As tabelas de conteúdo ainda vivem na Supabase; só o registro do job vai
// para o RDS. Some quando o banco `conteudo` for migrado.

async function insertBackgroundJob(row: {
  job_type: string
  status: string
  payload: unknown
  affected_rows: number
  started_at: string
  completed_at: string
}) {
  const sql = getSql()
  await sql`
    INSERT INTO background_jobs (job_type, status, payload, affected_rows, started_at, completed_at)
    VALUES (
      ${row.job_type},
      ${row.status},
      ${sql.json(row.payload as never)},
      ${row.affected_rows},
      ${row.started_at},
      ${row.completed_at}
    )
  `
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

const RETENCAO_LOTE = 20

type Janela = {
  startedAt: string
  start: string
  end: string
  snapshotDia: string
  mes: string
  retencaoInicio: string
}

async function registrarFalha(error: unknown) {
  const end = todaySp()
  const start = addDaysIso(end, -6)
  const message = error instanceof Error ? error.message : String(error)
  await insertBackgroundJob({
    job_type: 'youtube_analytics_sync',
    status: 'failed',
    payload: {
      windowStart: start,
      windowEnd: end,
      error: message,
    },
    affected_rows: 0,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  })
}

export const youtubeAnalyticsSync = inngest.createFunction(
  {
    id: 'youtube-analytics-sync',
    name: 'Sync diário YouTube Analytics',
    triggers: [{ cron: 'TZ=America/Sao_Paulo 0 8 * * *' }],
    onFailure: async ({ error }) => {
      try {
        await registrarFalha(error)
      } catch (err) {
        console.error('youtube-analytics-sync onFailure:', err)
      }
    },
  },
  async ({ step }) => {
    const janela = await step.run('calcular-janela', async (): Promise<Janela> => {
      const now = new Date()
      const end = todaySp(now)
      return {
        startedAt: now.toISOString(),
        start: addDaysIso(end, -6),
        end,
        snapshotDia: end,
        mes: currentMonthStart(now),
        retencaoInicio: addDaysIso(end, -89),
      }
    })

    const canalRows = await step.run('canal-diario', async () => {
      const admin = createAdminClient()
      const rows = await fetchCanalDiario(janela.start, janela.end)
      if (rows.length > 0) {
        const { error } = await admin
          .from('youtube_canal_diario')
          .upsert(rows, { onConflict: 'dia' })
        if (error) throw new Error(`canal_diario: ${error.message}`)
      }
      return rows.length
    })

    const trafegoRows = await step.run('trafego-diario', async () => {
      const admin = createAdminClient()
      const rows = await fetchTrafegoDiario(janela.start, janela.end)
      if (rows.length > 0) {
        const { error } = await admin
          .from('youtube_trafego_diario')
          .upsert(rows, { onConflict: 'dia,fonte' })
        if (error) throw new Error(`trafego_diario: ${error.message}`)
      }
      return rows.length
    })

    const videoDiarioRows = await step.run('video-diario', async () => {
      const admin = createAdminClient()
      let count = 0
      for (const day of eachDayInclusive(janela.start, janela.end)) {
        const rows = await fetchVideoDiarioForDay(day)
        if (rows.length > 0) {
          const { error } = await admin
            .from('youtube_video_diario')
            .upsert(rows, { onConflict: 'video_id,dia' })
          if (error) {
            throw new Error(`video_diario ${day}: ${error.message}`)
          }
          count += rows.length
        }
        await sleep(100)
      }
      return count
    })

    const videosMetadata = await step.run(
      'metadata-e-snapshot',
      async () => {
        const admin = createAdminClient()
        const metas = dedupeByVideoId(await fetchAllVideoMetadata())
        if (metas.length === 0) return 0

        for (let i = 0; i < metas.length; i += 200) {
          const batch = metas.slice(i, i + 200)
          const { error } = await admin
            .from('youtube_videos')
            .upsert(batch, { onConflict: 'video_id' })
          if (error) throw new Error(`youtube_videos: ${error.message}`)
        }

        const snapshots = dedupeByVideoId(
          metasToSnapshots(metas, janela.snapshotDia),
        )
        for (let i = 0; i < snapshots.length; i += 200) {
          const batch = snapshots.slice(i, i + 200)
          const { error } = await admin
            .from('youtube_video_snapshot')
            .upsert(batch, { onConflict: 'video_id,dia' })
          if (error) throw new Error(`video_snapshot: ${error.message}`)
        }

        return metas.length
      },
    )

    const recortes = await step.run('recortes-mensais', async () => {
      const admin = createAdminClient()
      const bounds = monthBounds(janela.mes)
      const recortesEnd =
        janela.end < bounds.end ? janela.end : bounds.end
      const data = await fetchRecortesMensais(
        bounds.start,
        recortesEnd,
        janela.mes,
      )

      if (data.demografia.length > 0) {
        const { error } = await admin.from('youtube_demografia').upsert(
          data.demografia,
          { onConflict: 'mes,faixa_etaria,genero' },
        )
        if (error) throw new Error(`demografia: ${error.message}`)
      }
      if (data.geografia.length > 0) {
        const { error } = await admin
          .from('youtube_geografia')
          .upsert(data.geografia, { onConflict: 'mes,pais' })
        if (error) throw new Error(`geografia: ${error.message}`)
      }
      if (data.termos.length > 0) {
        const { error } = await admin
          .from('youtube_termos_busca')
          .upsert(data.termos, { onConflict: 'mes,termo' })
        if (error) throw new Error(`termos_busca: ${error.message}`)
      }
      if (data.audiencia.length > 0) {
        const { error } = await admin
          .from('youtube_audiencia_recortes')
          .upsert(data.audiencia, { onConflict: 'mes,tipo,valor' })
        if (error) throw new Error(`audiencia_recortes: ${error.message}`)
      }

      return {
        demografia: data.demografia.length,
        geografia: data.geografia.length,
        termos: data.termos.length,
        audiencia: data.audiencia.length,
      }
    })

    const recentVideoIds = await step.run(
      'listar-videos-recentes',
      async () => {
        const admin = createAdminClient()
        const { data, error } = await admin
          .from('youtube_videos')
          .select('video_id')
          .gte('published_at', `${janela.retencaoInicio}T00:00:00.000Z`)
        if (error) throw new Error(`list recent: ${error.message}`)
        return (data ?? []).map((v) => v.video_id as string)
      },
    )

    let retencaoRows = 0
    const loteCount = Math.ceil(recentVideoIds.length / RETENCAO_LOTE) || 0
    for (let i = 0; i < loteCount; i++) {
      const batch = recentVideoIds.slice(
        i * RETENCAO_LOTE,
        (i + 1) * RETENCAO_LOTE,
      )
      const loteRows = await step.run(`retencao-lote-${i}`, async () => {
        const admin = createAdminClient()
        let count = 0
        for (const id of batch) {
          try {
            const rows = await fetchRetencaoVideo(
              id,
              janela.retencaoInicio,
              janela.end,
            )
            if (rows.length > 0) {
              const { error } = await admin.from('youtube_retencao').upsert(
                rows,
                { onConflict: 'video_id,ponto,periodo_fim' },
              )
              if (error) throw error
              count += rows.length
            }
          } catch (err) {
            console.error(`retenção ${id}:`, err)
          }
          await sleep(100)
        }
        return count
      })
      retencaoRows += loteRows
    }

    const payload = {
      windowStart: janela.start,
      windowEnd: janela.end,
      canalRows,
      trafegoRows,
      videoDiarioRows,
      videosMetadata,
      demografia: recortes.demografia,
      geografia: recortes.geografia,
      termos: recortes.termos,
      audiencia: recortes.audiencia,
      retencaoRows,
      recentVideos: recentVideoIds.length,
    }

    await step.run('registrar-background-job', async () => {
      try {
        await insertBackgroundJob({
          job_type: 'youtube_analytics_sync',
          status: 'completed',
          payload,
          affected_rows: videoDiarioRows + videosMetadata,
          started_at: janela.startedAt,
          completed_at: new Date().toISOString(),
        })
      } catch (error) {
        console.error(
          'Erro ao gravar background_jobs do youtube_analytics_sync:',
          error,
        )
      }
    })

    return payload
  },
)
