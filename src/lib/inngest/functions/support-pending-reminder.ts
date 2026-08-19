import { Resend } from 'resend'
import { asNumber, getSql } from '@/lib/db'
import { getAppBaseUrl } from '@/lib/url-base'
import { inngest } from '../client'

export const supportPendingReminder = inngest.createFunction(
  {
    id: 'support-pending-reminder',
    name: 'Suporte — lembrete de pendências',
    triggers: [{ cron: '0 */12 * * *' }],
  },
  async () => {
    const notifyEmail = process.env.SUPPORT_NOTIFY_EMAIL
    if (!notifyEmail) {
      console.warn('SUPPORT_NOTIFY_EMAIL ausente — lembrete ignorado')
      return { ok: true, skipped: 'missing_notify_email' }
    }

    const sql = getSql()
    const countRows = await sql<{ n: string | number }[]>`
      SELECT COUNT(*) AS n FROM support_threads
      WHERE status = ANY(${sql.array(['aguardando_revisao', 'aguardando_dados'])}::support_thread_status[])
    `
    const pending = asNumber(countRows[0]?.n)
    if (pending < 1) {
      return { ok: true, pending: 0 }
    }

    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.warn('RESEND_API_KEY ausente — lembrete de suporte não enviado')
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

    return { ok: true, pending }
  },
)
