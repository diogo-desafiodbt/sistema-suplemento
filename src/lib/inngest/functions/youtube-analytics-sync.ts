// DESLIGADO em 23/08/2026, a pedido do Diogo: ele não vai usar o dado do
// canal por enquanto. Esta função NÃO está na lista servida em
// src/app/api/inngest/route.ts, então o cron não dispara.
//
// A gravação já foi migrada para o RDS — religar é só devolver o import e
// a linha lá. As 10 tabelas estão prontas e vazias no banco `conteudo`.
import { getSqlConteudo, upsertConteudo } from '@/lib/conteudo/db'
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
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

const RETENCAO_LOTE = 20
const BATCH_SIZE = 200

type Janela = {
  startedAt: string
  start: string
  end: string
  snapshotDia: string
  mes: string
  retencaoInicio: string
}

export const youtubeAnalyticsSync = inngest.createFunction(
  {
    id: 'youtube-analytics-sync',
    name: 'Sync diário YouTube Analytics',
    triggers: [{ cron: 'TZ=America/Sao_Paulo 0 8 * * *' }],
  },
  async ({ step }) => {
    const jobId = await step.run('registrar-inicio', () =>
      registrarInicio('youtube_analytics_sync'),
    )
    try {
      const janela = await step.run(
        'calcular-janela',
        async (): Promise<Janela> => {
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
        },
      )

      const canalRows = await step.run('canal-diario', async () => {
        const sql = getSqlConteudo()
        const rows = await fetchCanalDiario(janela.start, janela.end)
        if (rows.length > 0) {
          await upsertConteudo(sql, 'youtube_canal_diario', rows)
        }
        return rows.length
      })

      const trafegoRows = await step.run('trafego-diario', async () => {
        const sql = getSqlConteudo()
        const rows = await fetchTrafegoDiario(janela.start, janela.end)
        if (rows.length > 0) {
          await upsertConteudo(sql, 'youtube_trafego_diario', rows)
        }
        return rows.length
      })

      const videoDiarioRows = await step.run('video-diario', async () => {
        const sql = getSqlConteudo()
        let count = 0
        for (const day of eachDayInclusive(janela.start, janela.end)) {
          const rows = await fetchVideoDiarioForDay(day)
          if (rows.length > 0) {
            await upsertConteudo(sql, 'youtube_video_diario', rows)
            count += rows.length
          }
          await sleep(100)
        }
        return count
      })

      const videosMetadata = await step.run(
        'metadata-e-snapshot',
        async () => {
          const sql = getSqlConteudo()
          const metas = dedupeByVideoId(await fetchAllVideoMetadata())
          if (metas.length === 0) return 0

          for (let i = 0; i < metas.length; i += BATCH_SIZE) {
            const batch = metas.slice(i, i + BATCH_SIZE)
            await upsertConteudo(sql, 'youtube_videos', batch)
          }

          const snapshots = dedupeByVideoId(
            metasToSnapshots(metas, janela.snapshotDia),
          )
          for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
            const batch = snapshots.slice(i, i + BATCH_SIZE)
            await upsertConteudo(sql, 'youtube_video_snapshot', batch)
          }

          return metas.length
        },
      )

      const recortes = await step.run('recortes-mensais', async () => {
        const sql = getSqlConteudo()
        const bounds = monthBounds(janela.mes)
        const recortesEnd =
          janela.end < bounds.end ? janela.end : bounds.end
        const data = await fetchRecortesMensais(
          bounds.start,
          recortesEnd,
          janela.mes,
        )

        if (data.demografia.length > 0) {
          await upsertConteudo(sql, 'youtube_demografia', data.demografia)
        }
        if (data.geografia.length > 0) {
          await upsertConteudo(sql, 'youtube_geografia', data.geografia)
        }
        if (data.termos.length > 0) {
          await upsertConteudo(sql, 'youtube_termos_busca', data.termos)
        }
        if (data.audiencia.length > 0) {
          await upsertConteudo(
            sql,
            'youtube_audiencia_recortes',
            data.audiencia,
          )
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
          const sql = getSqlConteudo()
          const cutoff = `${janela.retencaoInicio}T00:00:00.000Z`
          const rows = await sql<{ video_id: string }[]>`
            SELECT video_id FROM youtube_videos
            WHERE published_at >= ${cutoff}::timestamptz
          `
          return rows.map((v) => v.video_id)
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
          const sql = getSqlConteudo()
          let count = 0
          for (const id of batch) {
            try {
              const rows = await fetchRetencaoVideo(
                id,
                janela.retencaoInicio,
                janela.end,
              )
              if (rows.length > 0) {
                await upsertConteudo(sql, 'youtube_retencao', rows)
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
        await registrarFim(jobId, {
          status: 'completed',
          payload,
          affectedRows: videoDiarioRows + videosMetadata,
        })
      })

      return payload
    } catch (error) {
      await registrarFim(jobId, {
        status: 'failed',
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  },
)
