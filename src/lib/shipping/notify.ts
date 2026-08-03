import { Resend } from 'resend'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { RastreamentoEvento } from '@/types/shipping'

type AdminClient = ReturnType<typeof createAdminClient>

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
  incoming: RastreamentoEvento[]
): RastreamentoEvento[] {
  const base =
    existingJson && typeof existingJson === 'object' && !Array.isArray(existingJson)
      ? (existingJson as Record<string, unknown>)
      : {}

  const prev = Array.isArray(base.eventos)
    ? (base.eventos as Array<Record<string, unknown>>)
    : []

  const existingIds = new Set(
    prev.map((ev) => {
      const id = ev.id
      return id == null ? null : String(id)
    }).filter((id): id is string => id != null)
  )

  return incoming
    .filter((ev) => ev.id != null && !existingIds.has(String(ev.id)))
    .slice()
    .sort(
      (a, b) =>
        new Date(a.datahora).getTime() - new Date(b.datahora).getTime()
    )
}

async function logNotification(
  admin: AdminClient,
  userId: string,
  status: 'sent' | 'failed'
): Promise<void> {
  try {
    await admin.from('notification_logs').insert({
      user_id: userId,
      type: 'tracking_update',
      channel: 'email',
      status,
    })
  } catch (error) {
    console.error('Erro ao registrar notification_logs (tracking_update):', error)
  }
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

export async function notifyShippingUpdate(
  admin: AdminClient,
  params: {
    orderId: string
    eventId: string
    kind: ShippingNotificationKind
    trackingCode?: string | null
    descricao?: string | null
    local?: string | null
    cidade?: string | null
  }
): Promise<void> {
  try {
    const { data: order } = await admin
      .from('orders')
      .select('id, user_id')
      .eq('id', params.orderId)
      .maybeSingle()

    if (!order?.user_id) {
      console.error('notifyShippingUpdate: pedido sem user_id', params.orderId)
      return
    }

    const { data: user } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', order.user_id)
      .maybeSingle()

    if (!user?.email) {
      console.error('notifyShippingUpdate: usuário sem e-mail', order.user_id)
      return
    }

    const { error: insertError } = await admin
      .from('shipping_notification_logs')
      .insert({
        order_id: params.orderId,
        event_id: params.eventId,
      })

    if (insertError) {
      if (insertError.code === '23505') {
        return
      }
      console.error('notifyShippingUpdate: erro ao inserir log', insertError)
      return
    }

    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.warn('RESEND_API_KEY ausente — e-mail de frete não enviado')
      await logNotification(admin, order.user_id, 'failed')
      return
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
      await logNotification(admin, order.user_id, 'sent')
    } catch (error) {
      console.error('Erro ao enviar e-mail de frete:', error)
      await logNotification(admin, order.user_id, 'failed')
    }
  } catch (error) {
    console.error('notifyShippingUpdate error:', error)
  }
}

/** Notifica o comprador por cada evento de rastreio novo (após salvar o pedido). */
export async function notifyNewTrackingEvents(
  admin: AdminClient,
  orderId: string,
  newEvents: RastreamentoEvento[]
): Promise<void> {
  for (const evento of newEvents) {
    if (evento.finalizado === 1) {
      await notifyShippingUpdate(admin, {
        orderId,
        eventId: 'entregue',
        kind: 'delivered',
      })
    } else {
      await notifyShippingUpdate(admin, {
        orderId,
        eventId: String(evento.id),
        kind: 'tracking',
        descricao: evento.descricao,
        local: evento.local,
        cidade: evento.cidade,
      })
    }
  }
}
