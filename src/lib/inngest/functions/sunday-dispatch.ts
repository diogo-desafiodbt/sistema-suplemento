import { Resend } from 'resend'
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'

type RfmTier =
  | '1_campiao'
  | '2_dedicado'
  | '3_promissor'
  | '4_estavel'
  | '5_em_risco'
  | '6_hibernando'
  | '7_perdido'

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

function buildDispatchEmail(params: {
  firstName: string
  tier: RfmTier
  baseUrl: string
}): { subject: string; html: string } {
  const { firstName, tier, baseUrl } = params
  const safeName = escapeHtml(firstName)
  const dashboardUrl = escapeHtml(`${baseUrl}/dashboard`)
  const recomendacoesUrl = escapeHtml(`${baseUrl}/recomendacoes`)

  const content: Record<
    RfmTier,
    { subject: string; body: string; cta: string; ctaUrl: string }
  > = {
    '1_campiao': {
      subject: 'Seu cuidado faz diferença — continue assim',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Você está entre os pacientes mais dedicados do <strong style="color:#13244f;">Desafio Diabetes</strong>. Seu comprometimento com o tratamento é inspirador e os resultados aparecem para quem se mantém constante.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Que tal compartilhar essa jornada com alguém próximo que também possa se beneficiar? Cada indicação ajuda mais uma pessoa a cuidar da saúde.
        </p>
      `,
      cta: 'Acessar meu painel',
      ctaUrl: dashboardUrl,
    },
    '2_dedicado': {
      subject: 'Dica da semana para potencializar seu tratamento',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Você está evoluindo muito bem no seu tratamento do <strong style="color:#13244f;">Desafio Diabetes</strong>. Registrar seus exames periodicamente ajuda o Dr. Turi a acompanhar sua evolução com mais precisão.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Acesse seu painel para ver seu protocolo atualizado e registrar seus últimos resultados de glicemia ou HbA1c.
        </p>
      `,
      cta: 'Ver meu protocolo',
      ctaUrl: dashboardUrl,
    },
    '3_promissor': {
      subject: 'Você sabia que pode economizar e ter mais resultados?',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Pacientes que mantêm o tratamento por mais tempo têm resultados significativamente melhores no controle do diabetes. E com o plano anual do <strong style="color:#13244f;">Desafio Diabetes</strong>, você garante continuidade com um custo menor por mês.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Confira no seu painel as opções de plano disponíveis para você.
        </p>
      `,
      // TODO: atualizar para /dashboard/assinatura quando essa página existir
      cta: 'Ver opções de plano',
      ctaUrl: dashboardUrl,
    },
    '4_estavel': {
      subject: 'Seu tratamento está ativo — aproveite tudo que temos para você',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Bom dia! Sua assinatura do <strong style="color:#13244f;">Desafio Diabetes</strong> está ativa e seus suplementos seguem sendo enviados regularmente.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Aproveite também para acessar a Dieta de Reversão e o Guia Digital — conteúdos incluídos no seu plano que podem potencializar ainda mais os resultados do tratamento.
        </p>
      `,
      cta: 'Acessar meu painel',
      ctaUrl: dashboardUrl,
    },
    '5_em_risco': {
      subject: 'Estamos pensando em você',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Faz algum tempo que não te vemos por aqui e queríamos saber como você está. Cuidar do diabetes exige constância — e às vezes é normal ter momentos de pausa.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Seu tratamento ainda está ativo. Que tal retomar o acompanhamento e verificar seu protocolo? Estamos aqui para te apoiar nessa jornada.
        </p>
      `,
      cta: 'Retomar meu acompanhamento',
      ctaUrl: dashboardUrl,
    },
    '6_hibernando': {
      subject: 'Uma mensagem do Dr. Turi para você',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Olá. Aqui é o Dr. Turi Souza, especialista em diabetes do Desafio Diabetes.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Percebi que faz um tempo que você não acessa seu tratamento. Quero te dizer que o cuidado com o diabetes é uma jornada de longo prazo — e cada dia conta. O protocolo que montamos juntos foi pensado especificamente para o seu caso.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Estou à disposição se você tiver dúvidas ou quiser conversar sobre seu tratamento. Retome quando se sentir pronto — estamos aqui.
        </p>
      `,
      cta: 'Retomar meu tratamento',
      ctaUrl: recomendacoesUrl,
    },
    '7_perdido': {
      subject: 'Sua saúde não pode esperar — volte ao tratamento',
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          O diabetes não tratado avança silenciosamente. Sabemos que a vida fica corrida, mas o cuidado com a saúde precisa continuar.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          Você já fez o maior passo: buscou um tratamento personalizado. Retomar é simples — seu protocolo já está pronto e os suplementos chegam na sua casa.
        </p>
        <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">
          <strong style="color:#f4001e;">Não deixe para amanhã o que pode mudar sua saúde hoje.</strong>
        </p>
      `,
      cta: 'Retomar meu tratamento agora',
      ctaUrl: recomendacoesUrl,
    },
  }

  const { subject, body, cta, ctaUrl } = content[tier]

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
                    <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(cta)}</a>
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

export const sundayDispatch = inngest.createFunction(
  { id: 'sunday-dispatch', name: 'Disparo de domingo por tier', triggers: [{ cron: '0 9 * * 0' }] },
  async ({ step }) => {
    const result = await step.run('disparar-por-tier', async () => {
      const resendApiKey = process.env.RESEND_API_KEY
      if (!resendApiKey) {
        console.warn('RESEND_API_KEY ausente — sunday-dispatch não executado')
        return { dispatched: 0 }
      }

      const admin = createAdminClient()
      const resend = new Resend(resendApiKey)
      const baseUrl = getAppBaseUrl()
      const now = new Date()
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).toISOString()

      const { data: job } = await admin
        .from('background_jobs')
        .insert({
          job_type: 'sunday_dispatch',
          status: 'running',
          started_at: now.toISOString(),
        })
        .select('id')
        .single()

      const { data: alreadySent } = await admin
        .from('sunday_dispatch_logs')
        .select('user_id')
        .gte('sent_at', startOfToday)

      const alreadySentIds = new Set((alreadySent ?? []).map(r => r.user_id))

      const { data: rfmScores } = await admin
        .from('user_rfm_scores')
        .select('user_id, tier')

      if (!rfmScores || rfmScores.length === 0) {
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
        return { dispatched: 0 }
      }

      const toDispatch = rfmScores.filter(r => !alreadySentIds.has(r.user_id))

      let dispatched = 0

      for (const { user_id, tier } of toDispatch) {
        try {
          const { data: user } = await admin
            .from('users')
            .select('email, full_name')
            .eq('id', user_id)
            .single()

          if (!user?.email) continue

          const firstName = user.full_name?.split(' ')[0] ?? 'Olá'
          const { subject, html } = buildDispatchEmail({
            firstName,
            tier: tier as RfmTier,
            baseUrl,
          })

          await resend.emails.send({
            from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
            to: user.email,
            subject,
            html,
          })

          await admin.from('sunday_dispatch_logs').insert({
            user_id,
            tier_at_dispatch: tier,
            template_sent: tier,
            sent_at: new Date().toISOString(),
            channel: 'email',
          })

          await admin.from('notification_logs').insert({
            user_id,
            type: 'sunday_dispatch',
            channel: 'email',
            status: 'sent',
          })

          dispatched++
        } catch (err) {
          console.error(
            `Erro ao despachar sunday email para usuário ${user_id}:`,
            err
          )

          try {
            await admin.from('notification_logs').insert({
              user_id,
              type: 'sunday_dispatch',
              channel: 'email',
              status: 'failed',
            })
          } catch {
            // notification_logs opcional
          }
        }
      }

      if (job?.id) {
        await admin
          .from('background_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            affected_rows: dispatched,
          })
          .eq('id', job.id)
      }

      return { dispatched }
    })

    return result
  }
)
