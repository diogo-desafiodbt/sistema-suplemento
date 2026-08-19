import { Resend } from 'resend'
import { getSql } from '@/lib/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { isRecurringPlan } from '@/lib/plans'
import { getAppBaseUrl } from '@/lib/url-base'
import { inngest } from '../client'

type ReminderKind = 'd-5' | 'd-1' | 'd+3'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function aindaAtivo(userId: string): Promise<boolean> {
  const sql = getSql()
  const rows = await sql<{ expires_at: string | Date; status: string }[]>`
    SELECT expires_at, status FROM user_entitlements
    WHERE user_id = ${userId}::uuid
      AND product_key = 'treatment'
      AND status = 'active'
    LIMIT 1
  `
  const data = rows[0] ?? null

  if (!data) return false
  return new Date(data.expires_at) > new Date()
}

async function logNotification(
  userId: string,
  status: 'sent' | 'failed',
): Promise<void> {
  try {
    const sql = getSql()
    await sql`
      INSERT INTO notification_logs (user_id, type, channel, status)
      VALUES (${userId}::uuid, 'renewal_reminder', 'email', ${status})
    `
  } catch (error) {
    console.error('Erro ao registrar notification_logs:', error)
  }
}

function buildRenewalEmailHtml(params: {
  firstName: string
  kind: ReminderKind
  ctaUrl: string
}): { subject: string; html: string } {
  const { firstName, kind, ctaUrl } = params
  const safeName = escapeHtml(firstName)
  const safeCtaUrl = escapeHtml(ctaUrl)

  const content: Record<
    ReminderKind,
    { subject: string; body: string; cta: string }
  > = {
    'd-5': {
      subject: 'Seu protocolo está chegando ao fim — quer continuar?',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Seu protocolo do <strong style="color:#13244f;">Desafio Diabetes</strong> termina em <strong style="color:#13244f;">5 dias</strong>.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Se quiser manter seus suplementos e acompanhamento sem interrupção, é só renovar pelo link abaixo — você reaproveita o mesmo protocolo personalizado que já tem.
        </p>
      `,
      cta: 'Renovar meu tratamento',
    },
    'd-1': {
      subject: 'Amanhã é o último dia da sua cobertura atual',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Sua cobertura atual do tratamento <strong style="color:#13244f;">encerra amanhã</strong>. Depois disso, o envio dos suplementos e o acesso ao acompanhamento podem ser interrompidos.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Renove agora em poucos minutos para não perder a continuidade do seu cuidado.
        </p>
      `,
      cta: 'Renovar antes que expire',
    },
    'd+3': {
      subject:
        'Sentimos sua falta — que tal voltar a cuidar do seu tratamento?',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Faz alguns dias que seu plano expirou e a gente sente sua falta nessa jornada de cuidado com a saúde.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Seu protocolo personalizado continua disponível — retomar o tratamento é simples e você volta a receber seus suplementos em casa.
        </p>
      `,
      cta: 'Voltar ao meu tratamento',
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

async function sendRenewalReminderEmail(
  userId: string,
  kind: ReminderKind,
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY ausente — lembrete de renovação não enviado')
    return
  }

  const sql = getSql()
  const userRows = await sql<{ email: string | null; full_name: string | null }[]>`
    SELECT email, full_name FROM users WHERE id = ${userId}::uuid
  `
  const user = userRows[0]
  if (!user) {
    throw new Error(`Usuário não encontrado: ${userId}`)
  }

  if (!user?.email) {
    console.error('Usuário sem e-mail para lembrete de renovação:', userId)
    await logNotification(userId, 'failed')
    return
  }

  const firstName = user.full_name?.split(' ')[0] ?? 'Olá'
  const ctaUrl = `${getAppBaseUrl()}/recomendacoes`
  const { subject, html } = buildRenewalEmailHtml({ firstName, kind, ctaUrl })

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
    console.error(`Erro ao enviar lembrete ${kind}:`, error)
    await logNotification(userId, 'failed')
  }
}

export const avulsoRenewalReminder = inngest.createFunction(
  {
    id: 'avulso-renewal-reminder',
    name: 'Lembrete de renovação — plano avulso',
    triggers: [{ event: 'pagamento/confirmado' }],
  },
  async ({ event, step }) => {
    const jobId = await step.run('registrar-inicio', () =>
      registrarInicio('avulso_renewal_reminder'),
    )
    try {
    const { subscription_id, user_id } = event.data as {
      subscription_id: string
      user_id: string
    }

    const sub = await step.run('buscar-assinatura', async () => {
      const sql = getSql()
      const rows = await sql<
        {
          plan_type: string
          expires_at: string | Date | null
          pagarme_sub_id: string | null
        }[]
      >`
        SELECT plan_type, expires_at, pagarme_sub_id FROM subscriptions
        WHERE id = ${subscription_id}::uuid
      `
      const data = rows[0]
      if (!data) {
        throw new Error(`Assinatura não encontrada: ${subscription_id}`)
      }
      return data
    })

    // Só compra única (1/3/6 meses sem sub Pagar.me). Legado recorrente com
    // pagarme_sub_id não deve receber e-mail pedindo renovação manual.
    if (
      !sub ||
      isRecurringPlan(sub.plan_type) ||
      sub.pagarme_sub_id ||
      !sub.expires_at
    ) {
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 0,
        payload: { subscription_id, skipped: 'plano-e-recorrente' },
      })
      return { skipped: 'plano-e-recorrente' }
    }

    const expiresAt = new Date(sub.expires_at)
    const data5DiasAntes = new Date(
      expiresAt.getTime() - 5 * 24 * 60 * 60 * 1000,
    )
    const data1DiaAntes = new Date(
      expiresAt.getTime() - 1 * 24 * 60 * 60 * 1000,
    )
    const data3DiasDepois = new Date(
      expiresAt.getTime() + 3 * 24 * 60 * 60 * 1000,
    )

    await step.sleepUntil('aguardar-d-5', data5DiasAntes)
    if (await step.run('checar-renovou-1', () => aindaAtivo(user_id))) {
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 0,
        payload: { subscription_id, stopped: 'renovou-antes-d-5' },
      })
      return { stopped: 'renovou-antes-d-5' }
    }
    await step.run('lembrete-d-5', () =>
      sendRenewalReminderEmail(user_id, 'd-5'),
    )

    await step.sleepUntil('aguardar-d-1', data1DiaAntes)
    if (await step.run('checar-renovou-2', () => aindaAtivo(user_id))) {
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 0,
        payload: { subscription_id, stopped: 'renovou-antes-d-1' },
      })
      return { stopped: 'renovou-antes-d-1' }
    }
    await step.run('lembrete-d-1', () =>
      sendRenewalReminderEmail(user_id, 'd-1'),
    )

    await step.sleepUntil('aguardar-d+3', data3DiasDepois)
    if (await step.run('checar-renovou-3', () => aindaAtivo(user_id))) {
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 0,
        payload: { subscription_id, stopped: 'renovou-apos-expirar' },
      })
      return { stopped: 'renovou-apos-expirar' }
    }
    await step.run('reativacao-d+3', () =>
      sendRenewalReminderEmail(user_id, 'd+3'),
    )

    await registrarFim(jobId, {
      status: 'completed',
      affectedRows: 3,
      payload: { subscription_id, result: 'sequencia-concluida' },
    })
    return { result: 'sequencia-concluida' }
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
