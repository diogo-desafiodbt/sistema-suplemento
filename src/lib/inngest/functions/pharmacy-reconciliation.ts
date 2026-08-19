import { Resend } from 'resend'
import { getSql } from '@/lib/db'
import { registrarFim, registrarInicio } from '@/lib/jobs/registro'
import { inngest } from '../client'

const PHARMACY_EMAIL = 'diretorcomercialtk2@gmail.com'

// São Paulo é UTC-3 fixo (sem horário de verão desde 2019).
const SP_OFFSET = '-03:00'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Data de "ontem" (YYYY-MM-DD) na timezone America/Sao_Paulo. */
function yesterdayInSaoPaulo(now: Date): string {
  const spNow = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  spNow.setUTCDate(spNow.getUTCDate() - 1)
  return spNow.toISOString().slice(0, 10)
}

function dayRangeUtc(dateStr: string): { gte: string; lt: string } {
  const start = new Date(`${dateStr}T00:00:00${SP_OFFSET}`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { gte: start.toISOString(), lt: end.toISOString() }
}

export const pharmacyReconciliation = inngest.createFunction(
  {
    id: 'pharmacy-reconciliation',
    name: 'Reconciliação diária de pedidos puxados pela Miligrama',
    triggers: [{ cron: 'TZ=America/Sao_Paulo 0 9 * * *' }],
  },
  async ({ step }) => {
    const jobId = await step.run('registrar-inicio', () =>
      registrarInicio('pharmacy_reconciliation'),
    )

    let report: {
      date: string
      totalOrders: number
      totalCalls: number
      missing: string[]
      hadCalls: boolean
      ok: boolean
    }
    try {
    report = await step.run('reconciliar-ontem', async () => {
      const sql = getSql()
      const yesterday = yesterdayInSaoPaulo(new Date())
      const range = dayRangeUtc(yesterday)

      const orders = await sql<{ id: string }[]>`
        SELECT id FROM orders
        WHERE created_at >= ${range.gte}::timestamptz
          AND created_at < ${range.lt}::timestamptz
      `

      const logs = await sql<{ order_ids_returned: unknown }[]>`
        SELECT order_ids_returned FROM pharmacy_api_logs
        WHERE called_at >= ${range.gte}::timestamptz
          AND called_at < ${range.lt}::timestamptz
      `

      const pulledIds = new Set<string>()
      for (const log of logs ?? []) {
        const ids = log.order_ids_returned
        if (Array.isArray(ids)) {
          for (const id of ids) pulledIds.add(String(id))
        }
      }

      const orderIds = (orders ?? []).map((o) => o.id as string)
      const missing = orderIds.filter((id) => !pulledIds.has(id))
      const hadCalls = (logs ?? []).length > 0

      return {
        date: yesterday,
        totalOrders: orderIds.length,
        totalCalls: (logs ?? []).length,
        missing,
        hadCalls,
        ok: hadCalls && missing.length === 0,
      }
    })
    } catch (error) {
      await registrarFim(jobId, {
        status: 'failed',
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }

    await step.run('registrar-background-job', async () => {
      await registrarFim(jobId, {
        status: report.ok ? 'completed' : 'failed',
        payload: report,
        affectedRows: report.totalOrders,
      })
    })

    await step.run('enviar-email-reconciliacao', async () => {
      const resendApiKey = process.env.RESEND_API_KEY
      if (!resendApiKey) {
        throw new Error(
          'RESEND_API_KEY ausente — e-mail de reconciliação não enviado',
        )
      }

      const dateBr = report.date.split('-').reverse().join('/')

      let subject: string
      let bodyHtml: string

      if (report.ok) {
        subject = `Reconciliação OK — ${dateBr}`
        bodyHtml = `
  <p>Reconciliação OK — <strong>${report.totalOrders} pedido(s)</strong> de ${escapeHtml(dateBr)}, todos puxados pela Miligrama.</p>
  <p style="color:#555;">Chamadas registradas nesse dia: ${report.totalCalls}.</p>`
      } else if (!report.hadCalls) {
        subject = `Reconciliação com pendência — ${dateBr}`
        bodyHtml = `
  <p><strong>Reconciliação com pendência:</strong> a Miligrama não fez nenhuma chamada à API em ${escapeHtml(dateBr)}.</p>
  <p>Pedidos criados nesse dia: ${report.totalOrders}.</p>
  <p style="color:#b00;">Nenhum pedido foi puxado. Verificar com a Miligrama.</p>`
      } else {
        const lista = report.missing
          .map((id) => `<li>${escapeHtml(id)}</li>`)
          .join('\n')
        subject = `Reconciliação com pendência — ${dateBr}`
        bodyHtml = `
  <p><strong>Reconciliação com pendência</strong> em ${escapeHtml(dateBr)}: ${report.missing.length} de ${report.totalOrders} pedido(s) não apareceram em nenhuma chamada da Miligrama.</p>
  <p>Pedidos não puxados:</p>
  <ul>${lista}</ul>`
      }

      const resend = new Resend(resendApiKey)
      await resend.emails.send({
        from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
        to: PHARMACY_EMAIL,
        subject,
        html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="font-family:monospace,sans-serif;font-size:14px;color:#111;">
  <h2>Reconciliação diária — Desafio Diabetes × Miligrama</h2>
${bodyHtml}
</body>
</html>
`,
      })
    })

    return report
  },
)
