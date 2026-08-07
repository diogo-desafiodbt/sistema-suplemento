import Anthropic from '@anthropic-ai/sdk'
import type { SupportCategory, SupportDbFacts } from '@/lib/support/facts'

const MODEL = process.env.ANTHROPIC_SUPPORT_MODEL ?? 'claude-sonnet-4-20250514'

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function extractText(content: Anthropic.Message['content']): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export async function classifySupportThread(
  threadText: string,
): Promise<SupportCategory> {
  const client = getClient()
  if (!client) {
    console.warn(
      'ANTHROPIC_API_KEY ausente — classificação padrão fora_de_escopo',
    )
    return 'fora_de_escopo'
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 64,
    messages: [
      {
        role: 'user',
        content: `Classifique a conversa de suporte abaixo em UMA destas categorias:
- frete (rastreio, entrega, atraso, código de rastreio, transportadora)
- pagamento (cobrança, cartão, pix, fatura, assinatura, valor cobrado)
- fora_de_escopo (qualquer outra coisa)

Responda APENAS com uma palavra: frete OU pagamento OU fora_de_escopo.

CONVERSA:
${threadText}`,
      },
    ],
  })

  const raw = extractText(response.content).toLowerCase()
  if (raw.includes('frete')) return 'frete'
  if (raw.includes('pagamento')) return 'pagamento'
  return 'fora_de_escopo'
}

export async function draftSupportReply(params: {
  threadText: string
  facts: SupportDbFacts
  customerName?: string | null
}): Promise<string | null> {
  const client = getClient()
  if (!client) {
    console.warn('ANTHROPIC_API_KEY ausente — sem sugestão de resposta')
    return null
  }

  const name = params.customerName?.split(' ')[0] ?? 'cliente'

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Você é o time de suporte do Desafio Diabetes. Redija uma resposta em português brasileiro, tom acolhedor e objetivo, para o(a) ${name}.

REGRAS OBRIGATÓRIAS:
- Use SOMENTE os fatos do JSON abaixo. Nunca invente número de rastreio, status, valor ou data.
- Se algum campo estiver null/ausente, não invente — diga que a equipe vai verificar.
- Não mencione que você é uma IA.
- Não use markdown. Texto simples, pronto para e-mail.
- Assine como "Equipe Desafio Diabetes".

FATOS DO BANCO (JSON):
${JSON.stringify(params.facts, null, 2)}

CONVERSA DO CLIENTE:
${params.threadText}`,
      },
    ],
  })

  const text = extractText(response.content)
  return text || null
}
