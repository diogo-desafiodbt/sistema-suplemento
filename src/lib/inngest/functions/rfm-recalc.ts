import { asNumber, getSql } from '@/lib/db'
import { inngest } from '../client'

function calcRecencyScore(lastLoginAt: string | Date | null): number {
  if (!lastLoginAt) return 0
  const days = Math.floor(
    (Date.now() - new Date(lastLoginAt).getTime()) / (1000 * 60 * 60 * 24),
  )
  if (days <= 7) return 100
  if (days <= 14) return 85
  if (days <= 21) return 70
  if (days <= 30) return 55
  if (days <= 45) return 35
  if (days <= 60) return 20
  return 5
}

function calcFrequencyScore(loginCount: number): number {
  if (loginCount > 12) return 100
  if (loginCount >= 8) return 85
  if (loginCount >= 4) return 70
  if (loginCount >= 2) return 55
  if (loginCount === 1) return 35
  return 5
}

function calcMonetaryScore(
  sub: { plan_type: string; status: string } | null,
): number {
  if (!sub) return 5
  const { plan_type, status } = sub
  if (status === 'active') {
    if (plan_type === '1ano') return 100
    if (plan_type === '6meses') return 95
    if (plan_type === 'assinatura_mensal') return 90
    if (plan_type === '3meses') return 85
    if (plan_type === '1mes') return 70
  }
  if (status === 'past_due' || status === 'grace_period') return 40
  if (status === 'canceled' || status === 'expired') return 10
  return 5
}

function calcTier(score: number): string {
  if (score >= 86) return '1_campiao'
  if (score >= 71) return '2_dedicado'
  if (score >= 57) return '3_promissor'
  if (score >= 43) return '4_estavel'
  if (score >= 29) return '5_em_risco'
  if (score >= 15) return '6_hibernando'
  return '7_perdido'
}

export const rfmRecalc = inngest.createFunction(
  {
    id: 'rfm-recalc',
    name: 'Recalcular scores RFM',
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => {
    const result = await step.run('recalcular-rfm', async () => {
      const sql = getSql()
      const startedAt = new Date().toISOString()

      const jobRows = await sql<{ id: string }[]>`
        INSERT INTO background_jobs (job_type, status, started_at)
        VALUES ('rfm_recalc', 'running', ${startedAt})
        RETURNING id
      `
      const job = jobRows[0]
      if (!job) {
        throw new Error('rfm-recalc: insert background_jobs sem id')
      }

      const users = await sql<{ id: string }[]>`
        SELECT id FROM users
        WHERE rfm_recalc_queued_at IS NOT NULL
      `

      if (users.length === 0) {
        await sql`
          UPDATE background_jobs
          SET
            status = 'completed',
            completed_at = ${new Date().toISOString()},
            affected_rows = 0
          WHERE id = ${job.id}::uuid
        `
        return { recalculated: 0 }
      }

      const userIds = users.map((u) => u.id)
      const now = new Date()
      const ninetyDaysAgo = new Date(
        now.getTime() - 90 * 24 * 60 * 60 * 1000,
      ).toISOString()
      let processed = 0

      for (const userId of userIds) {
        try {
          const lastLoginRows = await sql<{ logged_at: string | Date }[]>`
            SELECT logged_at FROM user_login_history
            WHERE user_id = ${userId}::uuid
            ORDER BY logged_at DESC
            LIMIT 1
          `
          const lastLoginData = lastLoginRows[0] ?? null

          const countRows = await sql<{ n: string | number }[]>`
            SELECT COUNT(*) AS n FROM user_login_history
            WHERE user_id = ${userId}::uuid
              AND logged_at >= ${ninetyDaysAgo}::timestamptz
          `

          const subRows = await sql<{ plan_type: string; status: string }[]>`
            SELECT plan_type, status FROM subscriptions
            WHERE user_id = ${userId}::uuid
            ORDER BY created_at DESC
            LIMIT 1
          `
          const subscription = subRows[0] ?? null

          const recencyScore = calcRecencyScore(lastLoginData?.logged_at ?? null)
          const frequencyScore = calcFrequencyScore(asNumber(countRows[0]?.n))
          const monetaryScore = calcMonetaryScore(subscription)
          const finalScore = Math.round(
            recencyScore * 0.4 + frequencyScore * 0.3 + monetaryScore * 0.3,
          )
          const tier = calcTier(finalScore)

          const currentRfmRows = await sql<{ tier: string }[]>`
            SELECT tier FROM user_rfm_scores
            WHERE user_id = ${userId}::uuid
            LIMIT 1
          `
          const currentRfm = currentRfmRows[0] ?? null

          await sql`
            INSERT INTO user_rfm_scores (
              user_id, recency_score, frequency_score, monetary_score,
              final_score, tier, previous_tier, calculated_at
            )
            VALUES (
              ${userId}::uuid,
              ${recencyScore},
              ${frequencyScore},
              ${monetaryScore},
              ${finalScore},
              ${tier},
              ${currentRfm?.tier ?? null},
              ${now.toISOString()}
            )
            ON CONFLICT (user_id) DO UPDATE SET
              recency_score = EXCLUDED.recency_score,
              frequency_score = EXCLUDED.frequency_score,
              monetary_score = EXCLUDED.monetary_score,
              final_score = EXCLUDED.final_score,
              previous_tier = user_rfm_scores.tier,
              tier = EXCLUDED.tier,
              calculated_at = EXCLUDED.calculated_at
          `

          processed++
        } catch (err) {
          console.error(`Erro ao recalcular RFM do usuário ${userId}:`, err)
        }
      }

      await sql`
        UPDATE users
        SET rfm_recalc_queued_at = NULL
        WHERE id = ANY(${sql.array(userIds)}::uuid[])
      `

      await sql`
        UPDATE background_jobs
        SET
          status = 'completed',
          completed_at = ${new Date().toISOString()},
          affected_rows = ${processed}
        WHERE id = ${job.id}::uuid
      `

      return { recalculated: processed }
    })

    return result
  },
)
