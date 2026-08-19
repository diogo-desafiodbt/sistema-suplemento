import { Resend } from 'resend'
import { asNumber, getSql } from '@/lib/db'
import { claimOnce, markClaimCompleted, releaseClaim } from '@/lib/idempotency'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

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
    case '6meses':
      return 'Semestral'
    case '1ano':
      return 'Anual'
    case 'avulso':
    case '1mes':
      return 'Compra única'
    case 'assinatura_mensal':
      return 'Assinatura mensal'
    default:
      return planType ?? ''
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount) || amount === 0) {
    return 'valor não disponível'
  }
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

async function logNotification(
  userId: string,
  status: 'sent' | 'failed',
): Promise<void> {
  const sql = getSql()
  try {
    await sql`
      INSERT INTO notification_logs (user_id, type, channel, status)
      VALUES (${userId}::uuid, 'purchase_confirmed', 'email', ${status})
    `
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
    const jobId = await registrarInicio('purchase_confirmed')
    try {
    const {
      subscription_id,
      user_id,
      payment_id: eventPaymentId,
    } = event.data as {
      subscription_id: string
      user_id: string
      payment_id?: string
    }

    if (!subscription_id || !user_id) {
      throw new Error(
        'Evento pagamento/confirmado sem subscription_id ou user_id',
      )
    }

    const sql = getSql()

    let payment: { id: string; amount: number | null } | null = null

    if (eventPaymentId) {
      const rows = await sql<{ id: string; amount: string | number | null }[]>`
        SELECT id, amount FROM payments
        WHERE id = ${eventPaymentId}::uuid
          AND subscription_id = ${subscription_id}::uuid
        LIMIT 1
      `
      const row = rows[0] ?? null
      payment = row
        ? { id: row.id, amount: row.amount == null ? null : asNumber(row.amount) }
        : null
    } else {
      const candidates = await sql<
        { id: string; amount: string | number | null }[]
      >`
        SELECT id, amount FROM payments
        WHERE subscription_id = ${subscription_id}::uuid AND status = 'paid'
        ORDER BY created_at DESC
        LIMIT 20
      `

      for (const candidate of candidates) {
        const confirmLog = await sql<{ completed_at: string | Date | null }[]>`
          SELECT completed_at FROM purchase_confirmation_logs
          WHERE payment_id = ${candidate.id}::uuid
          LIMIT 1
        `
        if (!confirmLog[0]?.completed_at) {
          payment = {
            id: candidate.id,
            amount:
              candidate.amount == null ? null : asNumber(candidate.amount),
          }
          break
        }
      }
    }

    const [subscriptionRows, userRows] = await Promise.all([
      sql<{ plan_type: string; expires_at: string | Date | null }[]>`
        SELECT plan_type, expires_at FROM subscriptions
        WHERE id = ${subscription_id}::uuid
        LIMIT 1
      `,
      sql<{ full_name: string | null; email: string | null }[]>`
        SELECT full_name, email FROM users
        WHERE id = ${user_id}::uuid
        LIMIT 1
      `,
    ])
    const subscription = subscriptionRows[0] ?? null
    const user = userRows[0] ?? null

    if (!user?.email) {
      console.error('purchase-confirmed: usuário sem e-mail', user_id)
      await logNotification(user_id, 'failed')
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 0,
        payload: { subscription_id, reason: 'missing_email' },
      })
      return { ok: false, reason: 'missing_email' }
    }

    if (!payment?.id) {
      console.error('purchase-confirmed: payment ausente', subscription_id)
      await logNotification(user_id, 'failed')
      throw new Error(
        eventPaymentId
          ? `purchase-confirmed: payment ${eventPaymentId} não pertence à subscription ${subscription_id}`
          : `purchase-confirmed: nenhum payment pago pendente de e-mail para subscription ${subscription_id}`,
      )
    }

    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.error('purchase-confirmed: RESEND_API_KEY ausente')
      await logNotification(user_id, 'failed')
      await registrarFim(jobId, {
        status: 'completed',
        affectedRows: 0,
        payload: { subscription_id, reason: 'missing_resend_key' },
      })
      return { ok: false, reason: 'missing_resend_key' }
    }

    const firstName = user.full_name?.split(' ')[0] ?? 'Olá'
    const { subject, html } = buildPurchaseConfirmedEmailHtml({
      firstName,
      amountLabel: formatCurrency(payment.amount),
      planLabel: formatPlanLabel(subscription?.plan_type),
      expiresLabel: formatDate(subscription?.expires_at),
    })

    const { won } = await claimOnce(
      'purchase_confirmation_logs',
      { payment_id: payment.id },
      {
        timestampColumn: 'sent_at',
        completedColumn: 'completed_at',
        protectColumns: ['email_sent_at'],
        // Crash antes do send: reclaim após 10 min. Após o send gravamos
        // email_sent_at na claim — heal correlacionado ao payment_id.
        staleAfterMs: 10 * 60 * 1000,
      },
    )
    if (!won) {
      const existingClaimRows = await sql<
        {
          completed_at: string | Date | null
          email_sent_at: string | Date | null
        }[]
      >`
        SELECT completed_at, email_sent_at FROM purchase_confirmation_logs
        WHERE payment_id = ${payment.id}::uuid
        LIMIT 1
      `
      const existingClaim = existingClaimRows[0] ?? null

      if (existingClaim?.completed_at) {
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
          payload: { subscription_id, skipped: 'duplicate_payment' },
        })
        return {
          ok: true,
          skipped: 'duplicate_payment',
          payment_id: payment.id,
        }
      }

      // E-mail pode ter saído e markClaimCompleted falhado — confere email_sent_at.
      if (existingClaim?.email_sent_at) {
        await markClaimCompleted(
          'purchase_confirmation_logs',
          'payment_id',
          payment.id,
          'completed_at',
        )
        await registrarFim(jobId, {
          status: 'completed',
          affectedRows: 0,
          payload: { subscription_id, skipped: 'duplicate_payment' },
        })
        return {
          ok: true,
          skipped: 'duplicate_payment',
          payment_id: payment.id,
        }
      }

      // Sem evidência de envio: NÃO liberar a claim. claimOnce reclaima após stale.
      throw new Error(
        `purchase-confirmed: claim em andamento sem completed_at para payment ${payment.id}`,
      )
    }

    try {
      const resend = new Resend(resendApiKey)
      await resend.emails.send({
        from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
        to: user.email,
        subject,
        html,
      })
    } catch (error) {
      console.error('Erro ao enviar e-mail de compra confirmada:', error)
      await releaseClaim(
        'purchase_confirmation_logs',
        'payment_id',
        payment.id,
      )
      await logNotification(user_id, 'failed')
      throw error
    }

    // Evidência na própria claim (payment_id) — nunca releaseClaim pós-send.
    try {
      await sql`
        UPDATE purchase_confirmation_logs
        SET email_sent_at = ${new Date().toISOString()}
        WHERE payment_id = ${payment.id}::uuid
      `
    } catch (emailSentError) {
      try {
        await markClaimCompleted(
          'purchase_confirmation_logs',
          'payment_id',
          payment.id,
          'completed_at',
        )
      } catch (stampError) {
        console.error(
          'purchase-confirmed: falha ao stamp após e-mail (email_sent_at também falhou):',
          stampError,
        )
      }
      throw new Error(
        `purchase-confirmed: falha ao gravar email_sent_at: ${
          emailSentError instanceof Error
            ? emailSentError.message
            : String(emailSentError)
        }`,
      )
    }
    await markClaimCompleted(
      'purchase_confirmation_logs',
      'payment_id',
      payment.id,
      'completed_at',
    )
    await logNotification(user_id, 'sent')
    await registrarFim(jobId, {
      status: 'completed',
      affectedRows: 1,
      payload: { subscription_id, payment_id: payment.id },
    })
    return { ok: true }
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
