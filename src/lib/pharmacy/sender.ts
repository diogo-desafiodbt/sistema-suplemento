import { Resend } from 'resend'
import { PharmacyOrder } from '@/types/pharmacy'

const PHARMACY_EMAIL = 'diretorcomercialtk2@gmail.com'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function sendPharmacyOrderEmail(json: PharmacyOrder): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.error(
      '[pharmacy-order] RESEND_API_KEY ausente — pedido NÃO enviado para farmácia'
    )
    throw new Error('RESEND_API_KEY ausente — pedido não enviado para farmácia')
  }

  const cliente = escapeHtml(json.EntregaNome)
  const codigo = escapeHtml(json.ClienteCodigo)
  const plano = escapeHtml(json.FormaPagamentoCodigo)
  const endereco = escapeHtml(
    `${json.EntregaLogradouro}, ${json.EntregaNumero}${json.EntregaComplemento ? ` — ${json.EntregaComplemento}` : ''} — ${json.EntregaBairro}, ${json.EntregaCidade}/${json.EntregaEstado} — CEP ${json.EntregaCEP}`
  )
  const itens = json.Itens.map(
    item =>
      `• Produto ${item.CodigoProduto} | SKU ${item.CodigoBarras} | Qtd ${item.Quantidade}`
  ).join('\n')
  const jsonFormatted = escapeHtml(JSON.stringify(json, null, 2))

  try {
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
      to: PHARMACY_EMAIL,
      subject: `Novo pedido — ${json.EntregaNome} (${json.ClienteCodigo}) — ${json.FormaPagamentoCodigo}`,
      html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="font-family:monospace,sans-serif;font-size:14px;color:#111;">
  <h2>Novo pedido — Desafio Diabetes</h2>
  <p><strong>Cliente:</strong> ${cliente} (${codigo})</p>
  <p><strong>Plano:</strong> ${plano}</p>
  <p><strong>Endereço:</strong> ${endereco}</p>
  <p><strong>Prescrição:</strong> ${escapeHtml(json.Observacoes)}</p>
  <p><strong>Itens:</strong></p>
  <pre style="background:#f5f5f5;padding:12px;border-radius:4px;">${escapeHtml(itens)}</pre>
  <hr>
  <p><strong>JSON completo:</strong></p>
  <pre style="background:#f5f5f5;padding:12px;border-radius:4px;white-space:pre-wrap;">${jsonFormatted}</pre>
</body>
</html>
`,
    })
  } catch (error) {
    console.error('[pharmacy-order] Falha ao enviar email para farmácia:', error)
    throw error
  }
}

export async function sendToPharmacy(json: PharmacyOrder): Promise<void> {
  const url = process.env.PHARMACY_API_URL

  if (!url) {
    await sendPharmacyOrderEmail(json)
    return
  }

  const apiKey = process.env.PHARMACY_API_KEY ?? ''
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify(json),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Farmácia API respondeu ${response.status}: ${body}`)
  }
}
