import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getSupportClient, MODELO_SUPORTE } from '@/lib/support/ai'
import type { VerificacaoSaida } from '@/lib/support/travas'

const LIMITE_MOTIVO = 300

const Resultado = z.object({
  bloqueado: z.boolean(),
  motivo: z.string().max(LIMITE_MOTIVO).nullable(),
})

type Resultado = z.infer<typeof Resultado>

function montarPrompt(resposta: string): string {
  return `Você é o freio de segurança do suporte do Desafio Diabetes.
Leia SOMENTE a resposta abaixo — é texto que a equipe (ou a IA) redigiu para enviar ao cliente.
Não é o e-mail do cliente. Não classifique o pedido; julgue a RESPOSTA.

Bloqueie (bloqueado = true) se a resposta fizer QUALQUER uma destas coisas:
- prometer efeito terapêutico (cura, reverter diabetes, baixar glicemia, "vai melhorar", etc.)
- citar medicamento (nome de remédio, fármaco, metformina, insulina como orientação, etc.)
- sugerir ou alterar dose, posologia, frequência ou interrupção de tratamento
- afirmar algo sobre condição de saúde do cliente (diagnóstico, interpretação de quadro)
- interpretar exame (HbA1c, glicemia, laudo, "seu resultado significa")

NÃO bloqueie só porque:
- fala de pedido, frete, pagamento, assinatura, cupom ou conta
- diz que suplemento NÃO é medicamento / que deve falar com o médico
- aponta para uma aula ou link sem dar orientação clínica
- o TÍTULO de uma aula do acervo contém nome de medicamento (ex.: "AULA COMPLETA de GLIFAGE (Metformina)"). Título de aula não é orientação: julgue o que a resposta AFIRMA ao cliente, não o nome do vídeo indicado. Só bloqueie se o texto ao redor disser ao cliente o que fazer com o medicamento
- é uma saudação ou assinatura "Equipe Desafio Diabetes"

Se bloqueado = true, motivo em no máximo ${LIMITE_MOTIVO} caracteres, em português.
Se bloqueado = false, motivo = null.

RESPOSTA A JULGAR:
"""
${resposta}
"""`
}

/**
 * Última leitura sobre o texto redigido — nunca sobre o e-mail do cliente.
 * Não se aplica à resposta técnica de modelo fixo (Parte E).
 */
export async function verificarSaida(
  resposta: string,
): Promise<VerificacaoSaida> {
  const texto = resposta.trim()
  if (!texto) {
    return { ok: false, motivo: 'resposta vazia' }
  }

  const client = getSupportClient()
  if (!client) {
    return {
      ok: false,
      motivo: 'ANTHROPIC_API_KEY ausente — verificação de saída não rodou',
    }
  }

  const pedir = async (conteudo: string) => {
    const res = await client.messages.parse({
      model: MODELO_SUPORTE,
      max_tokens: 2000,
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(Resultado),
      },
      messages: [{ role: 'user', content: conteudo }],
    })
    return res.parsed_output ?? null
  }

  const base = montarPrompt(texto)
  let parsed: Resultado | null = null
  try {
    parsed = await pedir(base)
  } catch (erro) {
    console.warn(
      'Verificação de saída rejeitada na 1ª tentativa, repetindo:',
      erro instanceof Error ? erro.message : String(erro),
    )
    try {
      parsed = await pedir(
        `${base}

A tentativa anterior foi rejeitada. motivo ≤ ${LIMITE_MOTIVO} caracteres. Se bloqueado = false, motivo = null.`,
      )
    } catch (erro2) {
      console.error('Verificação de saída falhou nas duas tentativas:', erro2)
      return {
        ok: false,
        motivo: 'verificação de saída falhou na validação',
      }
    }
  }

  if (!parsed) {
    return { ok: false, motivo: 'verificação de saída sem resultado' }
  }

  if (parsed.bloqueado) {
    return {
      ok: false,
      motivo: parsed.motivo?.trim() || 'conteúdo clínico na resposta',
    }
  }

  return { ok: true, motivo: null }
}
