import { Resend } from 'resend'
import { asNumber, getSql } from '@/lib/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { getAppBaseUrl } from '@/lib/url-base'
import { inngest } from '../client'

export const supportPendingReminder = inngest.createFunction(
  {
    id: 'support-pending-reminder',
    name: 'Suporte — lembrete de pendências',
    triggers: [{ cron: '0 */12 * * *' }],
  },
  async () => {
    const jobId = await registrarInicio('support_pending_reminder')
    try {
    const notifyEmail = process.env.SUPPORT_NOTIFY_EMAIL
    if (!notifyEmail) {
      console.warn('SUPPORT_NOTIFY_EMAIL ausente — lembrete ignorado')
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 0,
        payload: { skipped: 'missing_notify_email' },
      })
      return { ok: true, skipped: 'missing_notify_email' }
    }

    const sql = getSql()
    const countRows = await sql<{ n: string | number }[]>`
      SELECT COUNT(*) AS n FROM support_threads
      WHERE status = ANY(${sql.array(['aguardando_revisao', 'aguardando_dados'])}::support_thread_status[])
    `
    const pending = asNumber(countRows[0]?.n)
    if (pending < 1) {
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 0,
        payload: { pending: 0 },
      })
      return { ok: true, pending: 0 }
    }

    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.warn('RESEND_API_KEY ausente — lembrete de suporte não enviado')
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: pending,
        payload: { ok: false, reason: 'missing_resend_key', pending },
      })
      return { ok: false, reason: 'missing_resend_key', pending }
    }

    const link = `${getAppBaseUrl()}/admin/suporte`
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
      to: notifyEmail,
      subject: `Você tem ${pending} pendência(s) em Suporte`,
      text: `Há ${pending} conversa(s) aguardando revisão ou dados em Suporte.\n\nAbrir painel: ${link}\n`,
      html: `
        <p>Há <strong>${pending}</strong> conversa(s) aguardando revisão ou dados em Suporte.</p>
        <p><a href="${link}">Abrir /admin/suporte</a></p>
      `.trim(),
    })

    await registrarFim(jobId, {
      status: 'completed',
      affectedRows: pending,
      payload: { pending },
    })
    return { ok: true, pending }
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
