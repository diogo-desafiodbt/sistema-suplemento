import { getSql } from '@/lib/db'

export async function registrarInicio(jobType: string): Promise<string> {
  try {
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      INSERT INTO background_jobs (job_type, status, started_at)
      VALUES (
        ${jobType}::job_type,
        'running'::job_status,
        ${new Date().toISOString()}
      )
      RETURNING id
    `
    return rows[0]?.id ?? ''
  } catch (error) {
    console.error('registrarInicio:', jobType, error)
    return ''
  }
}

export async function registrarFim(
  id: string,
  opts: {
    status: 'completed' | 'failed'
    affectedRows?: number
    payload?: unknown
  },
): Promise<void> {
  if (!id) return
  try {
    const sql = getSql()
    const completedAt = new Date().toISOString()
    const affected = opts.affectedRows ?? null
    if (opts.payload !== undefined) {
      await sql`
        UPDATE background_jobs
        SET
          status = ${opts.status}::job_status,
          completed_at = ${completedAt},
          affected_rows = ${affected},
          payload = ${sql.json(opts.payload as never)}
        WHERE id = ${id}::uuid
      `
    } else {
      await sql`
        UPDATE background_jobs
        SET
          status = ${opts.status}::job_status,
          completed_at = ${completedAt},
          affected_rows = ${affected}
        WHERE id = ${id}::uuid
      `
    }
  } catch (error) {
    console.error('registrarFim:', id, error)
  }
}
