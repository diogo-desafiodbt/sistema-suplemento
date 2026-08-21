import { type NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'

const DESTINO = 'suporte@desafiodiabetes.com'

const bodySchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  assunto: z.enum([
    'meu-pedido',
    'minha-assinatura',
    'guia-digital',
    'aplicativo',
    'consulta',
    'outro',
  ]),
  mensagem: z.string().trim().min(10).max(4000),
  // Campo isca: invisível para gente, irresistível para robô de formulário.
  // Se vier preenchido, respondemos 200 e não enviamos nada — robô que recebe
  // erro tenta de novo, robô que recebe sucesso vai embora.
  site: z.string().max(0).optional(),
})

const ROTULO: Record<string, string> = {
  'meu-pedido': 'Meu pedido de suplementos',
  'minha-assinatura': 'Minha assinatura',
  'guia-digital': 'Guia Digital da Reversão do Diabetes',
  aplicativo: 'Aplicativo',
  consulta: 'Consulta com o Dr. Turí Souza',
  outro: 'Outro assunto',
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Confira os campos e tente de novo.' },
        { status: 400 },
      )
    }

    const { nome, email, assunto, mensagem, site } = parsed.data
    if (site) return NextResponse.json({ ok: true })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('contato: RESEND_API_KEY ausente')
      return NextResponse.json(
        { error: 'Não conseguimos enviar agora. Escreva para suporte@desafiodiabetes.com.' },
        { status: 503 },
      )
    }

    const corpo = escapeHtml(mensagem).replace(/\n/g, '<br>')

    const { error } = await new Resend(apiKey).emails.send({
      from: 'Desafio Diabetes <noreply@desafiodiabetes.com>',
      to: DESTINO,
      // Quem responder da caixa do suporte responde direto para o cliente.
      replyTo: email,
      subject: `[Contato] ${ROTULO[assunto]} — ${nome}`,
      html: `
        <p><strong>${escapeHtml(nome)}</strong> &lt;${escapeHtml(email)}&gt;</p>
        <p><strong>Assunto:</strong> ${ROTULO[assunto]}</p>
        <hr>
        <p>${corpo}</p>
      `,
    })

    if (error) {
      console.error('contato: falha no envio', error)
      return NextResponse.json(
        { error: 'Não conseguimos enviar agora. Escreva para suporte@desafiodiabetes.com.' },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('contato:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
