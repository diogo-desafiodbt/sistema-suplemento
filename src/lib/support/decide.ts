import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getSupportClient, MODELO_SUPORTE } from '@/lib/support/ai'
import type { ResultadoInvestigacao } from '@/lib/support/investigate'
import type { Triagem } from '@/lib/support/triage'

/** Limites explícitos — o modelo precisa saber antes, senão a validação
 *  recusa tudo e o job parece "concluído" sem decisão. */
export const LIMITE_MOTIVO = 500
export const LIMITE_RESPOSTA = 4000
export const LIMITE_DADO = 120
export const LIMITE_DADOS = 20
export const LIMITE_TITULO_VIDEO = 200
export const LIMITE_URL_VIDEO = 500

export const Decisao = z.object({
  pode_resolver_sozinho: z.boolean(),
  motivo_escalonamento: z.string().max(LIMITE_MOTIVO).nullable(),
  resposta: z.string().max(LIMITE_RESPOSTA),
  dados_usados: z.array(z.string().max(LIMITE_DADO)).max(LIMITE_DADOS),
  video_sugerido: z
    .object({
      titulo: z.string().max(LIMITE_TITULO_VIDEO),
      url: z.string().max(LIMITE_URL_VIDEO),
    })
    .nullable(),
})

export type Decisao = z.infer<typeof Decisao>

function montarPromptDecisao(params: {
  triagem: Triagem
  investigacao: ResultadoInvestigacao
}): string {
  return `Você decide se o suporte do Desafio Diabetes pode responder sozinho e redige a resposta.

Entrada (já processada — NÃO é o e-mail bruto do cliente):
- triagem: ${JSON.stringify(params.triagem)}
- fatos da investigação: ${params.investigacao.texto}
- investigação truncada (bateu no teto de ferramentas): ${params.investigacao.truncada}

Regras:
- Use SOMENTE os fatos da investigação. Se algo não veio dali, não existe.
- Se a investigação estiver truncada, pode_resolver_sozinho = false e explique no motivo.
- Se faltar dado, for cancelamento/reembolso/estorno, for hostil, for prescrição, ou houver dúvida: pode_resolver_sozinho = false.
- resposta: texto pronto para e-mail, português brasileiro, sem markdown. Assine "Equipe Desafio Diabetes".
- dados_usados: lista curta do que de fato veio da investigação (nomes de fato/ferramenta). Vazio só se não usou nada.
- video_sugerido: só se a investigação trouxe um vídeo concreto; senão null. Nunca invente URL.
- motivo_escalonamento: obrigatório quando pode_resolver_sozinho = false; null quando true.

Limites rígidos (estourar invalida a resposta inteira):
- motivo_escalonamento: no máximo ${LIMITE_MOTIVO} caracteres
- resposta: no máximo ${LIMITE_RESPOSTA} caracteres
- cada item de dados_usados: no máximo ${LIMITE_DADO} caracteres; no máximo ${LIMITE_DADOS} itens
- video_sugerido.titulo: no máximo ${LIMITE_TITULO_VIDEO} caracteres
- video_sugerido.url: no máximo ${LIMITE_URL_VIDEO} caracteres`
}

/**
 * Segunda chamada: saída tipada. Recebe ficha + fatos — nunca o e-mail.
 * Validação recusada → uma segunda tentativa com o limite repetido.
 */
export async function decidir(params: {
  triagem: Triagem
  investigacao: ResultadoInvestigacao
}): Promise<Decisao | null> {
  const client = getSupportClient()
  if (!client) {
    console.warn('ANTHROPIC_API_KEY ausente — decisão pulada')
    return null
  }

  const pedir = async (conteudo: string) => {
    const res = await client.messages.parse({
      model: MODELO_SUPORTE,
      max_tokens: 4000,
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(Decisao),
      },
      messages: [{ role: 'user', content: conteudo }],
    })
    return res.parsed_output ?? null
  }

  const base = montarPromptDecisao(params)
  try {
    return await pedir(base)
  } catch (erro) {
    console.warn(
      'Decisão rejeitada na 1ª tentativa, repetindo:',
      erro instanceof Error ? erro.message : String(erro),
    )
    return await pedir(
      `${base}

A tentativa anterior foi rejeitada por passar dos limites. Encurte:
- motivo_escalonamento ≤ ${LIMITE_MOTIVO} caracteres
- resposta ≤ ${LIMITE_RESPOSTA} caracteres
- cada item de dados_usados ≤ ${LIMITE_DADO}; no máximo ${LIMITE_DADOS} itens
- título do vídeo ≤ ${LIMITE_TITULO_VIDEO}; url ≤ ${LIMITE_URL_VIDEO}
Não invente. Corte o texto.`,
    )
  }
}
