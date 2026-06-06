import { Resend } from 'resend'
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'

// TODO: trocar pelo link de autoatendimento (/dashboard/assinatura) quando essa página existir
const WHATSAPP_SUPORTE_URL =
  'https://wa.me/5521996661825?text=Ol%C3%A1!%20Estou%20com%20um%20problema%20no%20pagamento%20da%20minha%20assinatura%20do%20Desafio%20Diabetes%20e%20preciso%20de%20ajuda%20para%20regularizar.'

type ReminderKind = 'd0' | 'd2' | 'd5' | 'd9'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function assinaturaAtiva(subscriptionId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('subscriptions')
    .select('status')
    .eq('id', subscriptionId)
    .single()

  return data?.status === 'active'
}

async function logNotification(
  userId: string,
  status: 'sent' | 'failed'
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('notification_logs').insert({
      user_id: userId,
      type: 'payment_failed',
      channel: 'email',
      status,
    })
  } catch (error) {
    console.error('Erro ao registrar notification_logs:', error)
  }
}

function buildPaymentFailedEmailHtml(params: {
  firstName: string
  kind: ReminderKind
}): { subject: string; html: string } {
  const { firstName, kind } = params
  const safeName = escapeHtml(firstName)
  const safeCtaUrl = escapeHtml(WHATSAPP_SUPORTE_URL)

  const content: Record<
    ReminderKind,
    { subject: string; body: string; cta: string }
  > = {
    d0: {
      subject: 'Tivemos um problema com seu pagamento',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Identificamos um problema ao processar o pagamento da sua assinatura do <strong style="color:#13244f;">Desafio Diabetes</strong>.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Isso pode acontecer por limite do cartão, dados desatualizados ou bloqueio do banco. Nossa equipe pode te ajudar a regularizar rapidamente.
        </p>
      `,
      cta: 'Falar no WhatsApp',
    },
    d2: {
      subject: 'Ainda não conseguimos confirmar seu pagamento',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Passaram alguns dias e ainda não conseguimos confirmar o pagamento da sua assinatura.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Para manter seu tratamento ativo sem interrupção, entre em contato com nosso suporte e regularize o pagamento o quanto antes.
        </p>
      `,
      cta: 'Resolver pelo WhatsApp',
    },
    d5: {
      subject: 'Atualize seus dados de pagamento',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Seu pagamento ainda está pendente. Sem a regularização, o envio dos suplementos e o acesso ao tratamento podem ser interrompidos.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Fale com nossa equipe pelo WhatsApp para atualizar seus dados de pagamento e evitar a suspensão da assinatura.
        </p>
      `,
      cta: 'Resolver agora pelo WhatsApp',
    },
    d9: {
      subject: 'Sua assinatura será suspensa em breve',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Este é nosso <strong style="color:#f4001e;">último aviso</strong>: se o pagamento não for regularizado nos próximos dias, sua assinatura será suspensa e o acesso ao tratamento será encerrado.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Não queremos que você perca a continuidade do seu cuidado. Fale conosco agora — ainda dá tempo de resolver.
        </p>
      `,
      cta: 'Falar no WhatsApp agora',
    },
  }

  const { subject, body, cta } = content[kind]

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
              ${body}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="border-radius:999px;background-color:#f4001e;">
                    <a href="${safeCtaUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(cta)}</a>
                  </td>
                </tr>
              </table>
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
`

  return { subject, html }
}

async function sendPaymentFailedEmail(
  userId: string,
  kind: ReminderKind
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY ausente — e-mail de inadimplência não enviado')
    return
  }

  const admin = createAdminClient()
  const { data: user } = await admin
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .single()

  if (!user?.email) {
    console.error('Usuário sem e-mail para régua de cobrança:', userId)
    await logNotification(userId, 'failed')
    return
  }

  const firstName = user.full_name?.split(' ')[0] ?? 'Olá'
  const { subject, html } = buildPaymentFailedEmailHtml({ firstName, kind })

  try {
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
      to: user.email,
      subject,
      html,
    })
    await logNotification(userId, 'sent')
  } catch (error) {
    console.error(`Erro ao enviar e-mail de inadimplência (${kind}):`, error)
    await logNotification(userId, 'failed')
  }
}

async function cancelPagarmeSubscription(pagarmeSubId: string): Promise<void> {
  const apiKey = process.env.PAGARME_API_KEY
  if (!apiKey) {
    throw new Error('PAGARME_API_KEY ausente')
  }

  const pagarmeAuth = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  const res = await fetch(
    `https://api.pagar.me/core/v5/subscriptions/${pagarmeSubId}`,
    {
      method: 'DELETE',
      headers: { Authorization: pagarmeAuth },
    }
  )

  if (res.ok || res.status === 404) return

  const body = await res.text()
  const alreadyCanceled =
    res.status === 422 ||
    body.toLowerCase().includes('cancel') ||
    body.toLowerCase().includes('not found')

  if (alreadyCanceled) return

  throw new Error(
    `Erro ao cancelar assinatura no Pagar.me: ${res.status} ${body}`
  )
}

export const paymentRetry = inngest.createFunction(
  {
    id: 'payment-retry',
    name: 'Régua de cobrança — assinaturas',
    triggers: [{ event: 'pagamento/falhou' }],
  },
  async ({ event, step }) => {
    const { subscription_id, user_id } = event.data as {
      subscription_id: string
      user_id: string
    }

    const planInfo = await step.run('validar-plano', async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('subscriptions')
        .select('plan_type')
        .eq('id', subscription_id)
        .single()
      return data
    })

    if (!planInfo || planInfo.plan_type === '1mes') {
      return { skipped: 'plano-avulso' }
    }

    // D+0: past_due + grace de 20 dias + email neutro
    await step.run('marcar-past-due-e-notificar', async () => {
      const admin = createAdminClient()
      const gracePeriodEnd = new Date()
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 20)

      await admin
        .from('subscriptions')
        .update({
          status: 'past_due',
          grace_period_ends_at: gracePeriodEnd.toISOString(),
        })
        .eq('id', subscription_id)

      await sendPaymentFailedEmail(user_id, 'd0')
    })

    await step.sleep('aguardar-d2', '2d')
    if (await step.run('checar-d2', () => assinaturaAtiva(subscription_id))) {
      return { stopped: 'resolvido-antes-d2' }
    }
    await step.run('lembrete-d2', () => sendPaymentFailedEmail(user_id, 'd2'))

    await step.sleep('aguardar-d5', '3d')
    if (await step.run('checar-d5', () => assinaturaAtiva(subscription_id))) {
      return { stopped: 'resolvido-antes-d5' }
    }
    await step.run('lembrete-d5', () => sendPaymentFailedEmail(user_id, 'd5'))

    await step.sleep('aguardar-d9', '4d')
    if (await step.run('checar-d9', () => assinaturaAtiva(subscription_id))) {
      return { stopped: 'resolvido-antes-d9' }
    }
    await step.run('lembrete-d9', () => sendPaymentFailedEmail(user_id, 'd9'))

    // D+20: fim do grace period (11d após D+9)
    await step.sleep('aguardar-fim-grace', '11d')
    if (await step.run('checar-fim-grace', () => assinaturaAtiva(subscription_id))) {
      return { stopped: 'resolvido-antes-fim-grace' }
    }

    await step.run('cancelar-no-pagarme', async () => {
      const admin = createAdminClient()
      const { data: sub } = await admin
        .from('subscriptions')
        .select('pagarme_sub_id')
        .eq('id', subscription_id)
        .single()

      if (!sub?.pagarme_sub_id) {
        console.warn(
          `Assinatura ${subscription_id} sem pagarme_sub_id — cancelamento Pagar.me ignorado`
        )
        return
      }

      await cancelPagarmeSubscription(sub.pagarme_sub_id)
    })

    await step.run('cancelar-assinatura', async () => {
      const admin = createAdminClient()

      await admin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('id', subscription_id)

      await admin
        .from('user_entitlements')
        .update({ status: 'canceled' })
        .eq('user_id', user_id)
        .eq('product_key', 'treatment')
        .eq('status', 'active')
        .eq('is_permanent', false)
    })

    return { result: 'canceled' }
  }
)
