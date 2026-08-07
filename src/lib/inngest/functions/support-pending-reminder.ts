import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '../client'

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'https://desafiodiabetes.com'
}

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

    const admin = createAdminClient()
    const { count, error } = await admin
      .from('support_threads')
      .select('id', { count: 'exact', head: true })
      .in('status', ['aguardando_revisao', 'aguardando_dados'])

    if (error) throw error

    const pending = count ?? 0
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
