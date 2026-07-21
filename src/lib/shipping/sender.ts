import { Resend } from 'resend'
import { PharmacyOrder } from '@/types/pharmacy'

const TRANSPORTADORA_EMAIL = 'diretorcomercialtk2@gmail.com' // provisório — trocar quando tivermos o e-mail real da transportadora

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendToTransportadora(json: PharmacyOrder): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.error(
      '[shipping] RESEND_API_KEY ausente — envio NÃO enviado para transportadora'
    )
    throw new Error('RESEND_API_KEY ausente — envio não enviado para transportadora')
  }

  const destinatario = escapeHtml(json.EntregaNome)
  const codigoCliente = escapeHtml(json.ClienteCodigo)
  const codigoTransportadora = escapeHtml(json.TransportadoraCodigo)
  const endereco = escapeHtml(
    `${json.EntregaLogradouro}, ${json.EntregaNumero}${json.EntregaComplemento ? ` — ${json.EntregaComplemento}` : ''} — ${json.EntregaBairro}, ${json.EntregaCidade}/${json.EntregaEstado} — CEP ${json.EntregaCEP}`
  )
  const quantidadeTotal = json.Itens.reduce((sum, item) => sum + item.Quantidade, 0)

  try {
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
      to: TRANSPORTADORA_EMAIL,
      subject: `Novo envio — ${json.EntregaNome} (${json.ClienteCodigo})`,
      html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="font-family:monospace,sans-serif;font-size:14px;color:#111;">
  <h2>Novo envio — Desafio Diabetes</h2>
  <p><strong>Destinatário:</strong> ${destinatario}</p>
  <p><strong>Endereço:</strong> ${endereco}</p>
  <p><strong>Código do cliente:</strong> ${codigoCliente}</p>
  <p><strong>Código da transportadora:</strong> ${codigoTransportadora}</p>
  <p><strong>Quantidade total de itens:</strong> ${quantidadeTotal}</p>
</body>
</html>
`,
    })
  } catch (error) {
    console.error('[shipping] Falha ao enviar email para transportadora:', error)
    throw error
  }
}
