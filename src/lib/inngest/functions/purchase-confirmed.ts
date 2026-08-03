import { Resend } from 'resend'
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPlanLabel(planType: string | null | undefined): string {
  switch (planType) {
    case '3meses':
      return 'Trimestral'
    case '1ano':
      return 'Anual'
    case 'avulso':
    case '1mes':
      return 'Avulso'
    case 'assinatura_mensal':
      return 'Assinatura mensal'
    default:
      return planType ?? '—'
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

async function logNotification(
  userId: string,
  status: 'sent' | 'failed'
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('notification_logs').insert({
      user_id: userId,
      type: 'purchase_confirmed',
      channel: 'email',
      status,
    })
  } catch (error) {
    console.error('Erro ao registrar notification_logs:', error)
  }
}

function buildPurchaseConfirmedEmailHtml(params: {
  firstName: string
  amountLabel: string
  planLabel: string
  expiresLabel: string
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.firstName)
  const safeAmount = escapeHtml(params.amountLabel)
  const safePlan = escapeHtml(params.planLabel)
  const safeExpires = escapeHtml(params.expiresLabel)

  const subject = 'Compra confirmada'
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f0eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0eb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;border:1px solid #f0f0f0;overflow:hidden;">
          <tr>
            <td style="background-color:#13244f;padding:28px 32px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.02em;">Desafio Diabetes</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#13244f;font-size:16px;line-height:1.6;">Olá, <strong>${safeName}</strong>,</p>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
                Seu pagamento de <strong style="color:#13244f;">${safeAmount}</strong> foi aprovado. Compra confirmada (${safePlan}).
              </p>
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
                A farmácia parceira já está <strong style="color:#13244f;">preparando seus suplementos</strong> para envio. Você não precisa fazer nada agora — assim que houver novidades sobre o envio, avisaremos você por aqui.
              </p>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.7;">
                Seu acesso ao tratamento está ativo até <strong style="color:#13244f;">${safeExpires}</strong>.
              </p>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                Com carinho,<br>
                <span style="color:#13244f;font-weight:600;">Equipe Desafio Diabetes</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #f0f0f0;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;text-align:center;">
                Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return { subject, html }
}

export const purchaseConfirmed = inngest.createFunction(
  {
    id: 'purchase-confirmed',
    name: 'E-mail de compra confirmada',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event }) => {
    const { subscription_id, user_id } = event.data as {
      subscription_id: string
      user_id: string
    }

    if (!subscription_id || !user_id) {
      throw new Error('Evento pagamento/confirmado sem subscription_id ou user_id')
    }

    const admin = createAdminClient()

    const [{ data: subscription }, { data: user }, { data: payment }] =
      await Promise.all([
        admin
          .from('subscriptions')
          .select('plan_type, expires_at')
          .eq('id', subscription_id)
          .maybeSingle(),
        admin
          .from('users')
          .select('full_name, email')
          .eq('id', user_id)
          .maybeSingle(),
        admin
          .from('payments')
          .select('amount')
          .eq('subscription_id', subscription_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    if (!user?.email) {
      console.error('purchase-confirmed: usuário sem e-mail', user_id)
      await logNotification(user_id, 'failed')
      return { ok: false, reason: 'missing_email' }
    }

    // Evita e-mail duplicado quando checkout (cartão) e webhook disparam o mesmo evento em sequência.
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: recentSent } = await admin
      .from('notification_logs')
      .select('id')
      .eq('user_id', user_id)
      .eq('type', 'purchase_confirmed')
      .eq('status', 'sent')
      .gte('created_at', since)
      .limit(1)
      .maybeSingle()

    if (recentSent) {
      return { ok: true, skipped: 'duplicate_recent' }
    }

    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.error('purchase-confirmed: RESEND_API_KEY ausente')
      await logNotification(user_id, 'failed')
      return { ok: false, reason: 'missing_resend_key' }
    }

    const firstName = user.full_name?.split(' ')[0] ?? 'Olá'
    const { subject, html } = buildPurchaseConfirmedEmailHtml({
      firstName,
      amountLabel: formatCurrency(payment?.amount),
      planLabel: formatPlanLabel(subscription?.plan_type),
      expiresLabel: formatDate(subscription?.expires_at),
    })

    try {
      const resend = new Resend(resendApiKey)
      await resend.emails.send({
        from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
        to: user.email,
        subject,
        html,
      })
      await logNotification(user_id, 'sent')
      return { ok: true }
    } catch (error) {
      console.error('Erro ao enviar e-mail de compra confirmada:', error)
      await logNotification(user_id, 'failed')
      throw error
    }
  }
)
