import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'

function calcRecencyScore(lastLoginAt: string | null): number {
  if (!lastLoginAt) return 0
  const days = Math.floor(
    (Date.now() - new Date(lastLoginAt).getTime()) / (1000 * 60 * 60 * 24)
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
  sub: { plan_type: string; status: string } | null
): number {
  if (!sub) return 5
  const { plan_type, status } = sub
  if (status === 'active') {
    if (plan_type === '1ano') return 100
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
  { id: 'rfm-recalc', name: 'Recalcular scores RFM', triggers: [{ cron: '0 * * * *' }] },
  async ({ step }) => {
    const result = await step.run('recalcular-rfm', async () => {
      const admin = createAdminClient()
      const startedAt = new Date().toISOString()

      const { data: job } = await admin
        .from('background_jobs')
        .insert({ job_type: 'rfm_recalc', status: 'running', started_at: startedAt })
        .select('id')
        .single()

      const { data: users } = await admin
        .from('users')
        .select('id')
        .not('rfm_recalc_queued_at', 'is', null)

      if (!users || users.length === 0) {
        if (job?.id) {
          await admin
            .from('background_jobs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              affected_rows: 0,
            })
            .eq('id', job.id)
        }
        return { recalculated: 0 }
      }

      const userIds = users.map(u => u.id)
      const now = new Date()
      const ninetyDaysAgo = new Date(
        now.getTime() - 90 * 24 * 60 * 60 * 1000
      ).toISOString()
      let processed = 0

      for (const userId of userIds) {
        try {
          const { data: lastLoginData } = await admin
            .from('user_login_history')
            .select('logged_at')
            .eq('user_id', userId)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const { count: loginCount } = await admin
            .from('user_login_history')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('logged_at', ninetyDaysAgo)

          const { data: subscription } = await admin
            .from('subscriptions')
            .select('plan_type, status')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const recencyScore = calcRecencyScore(lastLoginData?.logged_at ?? null)
          const frequencyScore = calcFrequencyScore(loginCount ?? 0)
          const monetaryScore = calcMonetaryScore(subscription)
          const finalScore = Math.round(
            recencyScore * 0.4 + frequencyScore * 0.3 + monetaryScore * 0.3
          )
          const tier = calcTier(finalScore)

          const { data: currentRfm } = await admin
            .from('user_rfm_scores')
            .select('tier')
            .eq('user_id', userId)
            .maybeSingle()

          await admin.from('user_rfm_scores').upsert(
            {
              user_id: userId,
              recency_score: recencyScore,
              frequency_score: frequencyScore,
              monetary_score: monetaryScore,
              final_score: finalScore,
              tier,
              previous_tier: currentRfm?.tier ?? null,
              calculated_at: now.toISOString(),
            },
            { onConflict: 'user_id' }
          )

          processed++
        } catch (err) {
          console.error(`Erro ao recalcular RFM do usuário ${userId}:`, err)
        }
      }

      await admin
        .from('users')
        .update({ rfm_recalc_queued_at: null })
        .in('id', userIds)

      if (job?.id) {
        await admin
          .from('background_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            affected_rows: processed,
          })
          .eq('id', job.id)
      }

      return { recalculated: processed }
    })

    return result
  }
)
