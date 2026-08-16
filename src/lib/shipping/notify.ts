import { Resend } from 'resend'
import { getSql } from '@/lib/db'
import { claimOnce, markClaimCompleted, releaseClaim } from '@/lib/idempotency'
import { trackingEventKey } from '@/lib/shipping/create-label'
import type { RastreamentoEvento } from '@/types/shipping'

export type ShippingNotificationKind = 'dispatched' | 'tracking' | 'delivered'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'https://desafiodiabetes.com'
}

/** Eventos do payload que ainda não estavam em `orders.shipping_json.eventos`. */
export function getNewTrackingEvents(
  existingJson: unknown,
  incoming: RastreamentoEvento[],
): RastreamentoEvento[] {
  const base =
    existingJson &&
    typeof existingJson === 'object' &&
    !Array.isArray(existingJson)
      ? (existingJson as Record<string, unknown>)
      : {}

  const prev = Array.isArray(base.eventos)
    ? (base.eventos as Array<Record<string, unknown>>)
    : []

  const existingKeys = new Set(prev.map((ev) => trackingEventKey(ev)))

  return incoming
    .filter((ev) => {
      const key = trackingEventKey(ev as unknown as Record<string, unknown>)
      return !existingKeys.has(key)
    })
    .slice()
    .sort(
      (a, b) => new Date(a.datahora).getTime() - new Date(b.datahora).getTime(),
    )
}

async function logNotification(
  userId: string,
  status: 'sent' | 'failed',
): Promise<void> {
  const sql = getSql()
  try {
    await sql`
      INSERT INTO notification_logs (user_id, type, channel, status)
      VALUES (${userId}::uuid, 'tracking_update', 'email', ${status})
    `
  } catch (error) {
    console.error(
      'Erro ao registrar notification_logs (tracking_update):',
      error,
    )
  }
}

async function markShippingEmailSent(
  claimKeys: { order_id: string; event_id: string },
): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE shipping_notification_logs
    SET email_sent_at = ${new Date().toISOString()}
    WHERE order_id = ${claimKeys.order_id}::uuid
      AND event_id = ${claimKeys.event_id}
  `
}

/** Se o e-mail já saiu (email_sent_at na claim) ou completed_at, completa e retorna true. */
async function healShippingClaimIfSent(
  claimKeys: { order_id: string; event_id: string },
): Promise<boolean> {
  const sql = getSql()
  const rows = await sql<
    { completed_at: string | Date | null; email_sent_at: string | Date | null }[]
  >`
    SELECT completed_at, email_sent_at FROM shipping_notification_logs
    WHERE order_id = ${claimKeys.order_id}::uuid
      AND event_id = ${claimKeys.event_id}
    LIMIT 1
  `
  const existingClaim = rows[0] ?? null

  if (existingClaim?.completed_at) return true

  if (!existingClaim?.email_sent_at) return false

  await markClaimCompleted(
    'shipping_notification_logs',
    claimKeys,
    undefined,
    'completed_at',
  )
  return true
}

function buildShippingEmailHtml(params: {
  firstName: string
  kind: ShippingNotificationKind
  ctaUrl: string
  trackingCode?: string | null
  descricao?: string | null
  local?: string | null
  cidade?: string | null
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.firstName)
  const safeCtaUrl = escapeHtml(params.ctaUrl)
  const placeParts = [params.cidade, params.local].filter(Boolean)
  const placeLabel = placeParts.length > 0 ? placeParts.join(' — ') : null

  let subject: string
  let body: string

  if (params.kind === 'dispatched') {
    subject = 'Seu pedido foi despachado!'
    const code = params.trackingCode
      ? `<strong style="color:#13244f;">${escapeHtml(params.trackingCode)}</strong>`
      : 'seu código de rastreio'
    body = `
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
        Boa notícia: seu pedido saiu para entrega. O código de rastreio é ${code}.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
        O rastreio vai sendo atualizado no seu painel conforme a transportadora avança.
      </p>
    `
  } else if (params.kind === 'delivered') {
    subject = 'Seu pedido foi entregue! 🎉'
    body = `
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
        Seu pedido foi <strong style="color:#13244f;">entregue</strong>. Esperamos que você aproveite cada passo do tratamento.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
        Qualquer dúvida, estamos por aqui.
      </p>
    `
  } else {
    subject = 'Atualização no rastreio do seu pedido'
    const desc = params.descricao
      ? escapeHtml(params.descricao)
      : 'Há uma nova atualização no trajeto do seu pedido.'
    const placeLine = placeLabel
      ? `<p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">Local: <strong style="color:#13244f;">${escapeHtml(placeLabel)}</strong></p>`
      : ''
    body = `
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
        ${desc}
      </p>
      ${placeLine}
    `
  }

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
                    <a href="${safeCtaUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Ver meu pedido</a>
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
  `.trim()

  return { subject, html }
}

export async function notifyShippingUpdate(params: {
    orderId: string
    eventId: string
    kind: ShippingNotificationKind
    trackingCode?: string | null
    descricao?: string | null
    local?: string | null
    cidade?: string | null
  },
): Promise<void> {
  try {
    const sql = getSql()
    const orderRows = await sql<{ id: string; user_id: string | null }[]>`
      SELECT id, user_id FROM orders
      WHERE id = ${params.orderId}::uuid
      LIMIT 1
    `
    const order = orderRows[0] ?? null

    if (!order?.user_id) {
      console.error('notifyShippingUpdate: pedido sem user_id', params.orderId)
      return
    }

    const userRows = await sql<{ full_name: string | null; email: string | null }[]>`
      SELECT full_name, email FROM users
      WHERE id = ${order.user_id}::uuid
      LIMIT 1
    `
    const user = userRows[0] ?? null

    if (!user?.email) {
      console.error('notifyShippingUpdate: usuário sem e-mail', order.user_id)
      return
    }

    const claimKeys = {
      order_id: params.orderId,
      event_id: params.eventId,
    }

    const shippingClaimOpts = {
      timestampColumn: 'sent_at' as const,
      completedColumn: 'completed_at' as const,
      protectColumns: ['email_sent_at'],
      // Crash antes do send: reclaim após 2 min. Após o send gravamos
      // email_sent_at na claim — heal correlacionado, sem notification_logs.
      staleAfterMs: 2 * 60 * 1000,
    }

    const { won } = await claimOnce(
      'shipping_notification_logs',
      claimKeys,
      shippingClaimOpts,
    )

    let claimed = won
    if (!won) {
      if (await healShippingClaimIfSent(claimKeys)) return

      // Espera breve o outro worker (~15s), sem releaseClaim manual.
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (await healShippingClaimIfSent(claimKeys)) return
      }

      const retry = await claimOnce(
        'shipping_notification_logs',
        claimKeys,
        shippingClaimOpts,
      )
      if (!retry.won) {
        if (await healShippingClaimIfSent(claimKeys)) return
        throw new Error(
          `notifyShippingUpdate: claim incompleta após espera para order ${params.orderId} event ${params.eventId}`,
        )
      }
      // Reclaim só acontece sem email_sent_at (protectColumns).
      claimed = true
    }

    if (!claimed) return

    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.warn('RESEND_API_KEY ausente — e-mail de frete não enviado')
      await releaseClaim('shipping_notification_logs', claimKeys)
      await logNotification(order.user_id, 'failed')
      throw new Error('RESEND_API_KEY ausente — e-mail de frete não enviado')
    }

    const firstName = user.full_name?.split(' ')[0] ?? 'Olá'
    const ctaUrl = `${getAppBaseUrl()}/dashboard/pedidos/${params.orderId}`
    const { subject, html } = buildShippingEmailHtml({
      firstName,
      kind: params.kind,
      ctaUrl,
      trackingCode: params.trackingCode,
      descricao: params.descricao,
      local: params.local,
      cidade: params.cidade,
    })

    try {
      const resend = new Resend(resendApiKey)
      await resend.emails.send({
        from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
        to: user.email,
        subject,
        html,
      })
    } catch (error) {
      await releaseClaim('shipping_notification_logs', claimKeys)
      console.error('Erro ao enviar e-mail de frete:', error)
      await logNotification(order.user_id, 'failed')
      throw error
    }

    // Evidência na própria claim (order_id+event_id) — nunca releaseClaim pós-send.
    try {
      await markShippingEmailSent(claimKeys)
    } catch (emailSentError) {
      try {
        await markClaimCompleted(
          'shipping_notification_logs',
          claimKeys,
          undefined,
          'completed_at',
        )
      } catch (stampError) {
        console.error(
          'notifyShippingUpdate: falha ao stamp após e-mail (email_sent_at também falhou):',
          stampError,
        )
      }
      throw emailSentError
    }
    await markClaimCompleted(
      'shipping_notification_logs',
      claimKeys,
      undefined,
      'completed_at',
    )
    await logNotification(order.user_id, 'sent')
  } catch (error) {
    console.error('notifyShippingUpdate error:', error)
    throw error
  }
}

/** Notifica o comprador por cada evento de rastreio novo (após salvar o pedido). */
export async function notifyNewTrackingEvents(
  orderId: string,
  newEvents: RastreamentoEvento[],
): Promise<void> {
  for (const evento of newEvents) {
    if (evento.finalizado === 1) {
      await notifyShippingUpdate({
        orderId,
        eventId: 'entregue',
        kind: 'delivered',
      })
    } else {
      await notifyShippingUpdate({
        orderId,
        eventId: trackingEventKey(evento as unknown as Record<string, unknown>),
        kind: 'tracking',
        descricao: evento.descricao,
        local: evento.local,
        cidade: evento.cidade,
      })
    }
  }
}
