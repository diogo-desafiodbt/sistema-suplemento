import type Anthropic from '@anthropic-ai/sdk'
import { getSupportClient, MODELO_SUPORTE } from '@/lib/support/ai'
import type { Triagem } from '@/lib/support/triage'
import { criarFerramentas } from '@/lib/support/tools'

/**
 * Monta o pedido de investigação a partir da ficha — nunca do e-mail bruto.
 * O texto do cliente fica na triagem; esta IA só vê a estrutura.
 */
export function montarPromptDeInvestigacao(triagem: Triagem): string {
  return `Investigue o necessário usando as ferramentas. Não invente nenhum dado — se uma informação não veio de uma ferramenta, ela não existe.

Ficha da triagem (já classificada; não é o e-mail original):
- categoria: ${triagem.categoria}
- pergunta resumida: ${triagem.pergunta_resumida}
- referência citada: ${triagem.referencia_citada ?? '(nenhuma)'}
- tom: ${triagem.tom}
- urgência: ${triagem.urgencia}

Use só as ferramentas que forem úteis para essa ficha. Ao terminar, resuma em texto claro o que as ferramentas devolveram — só fatos, sem inventar.`
}

function extrairTexto(
  content: Anthropic.Beta.Messages.BetaMessage['content'],
): string {
  return content
    .filter(
      (b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text',
    )
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export type ResultadoInvestigacao = {
  /** Resumo factual que a IA privilegiada produziu a partir das ferramentas. */
  texto: string
  /**
   * A investigação bateu no teto de rodadas com ferramenta ainda pendente.
   * O SDK, nesse caso, encerra o laço em silêncio ("the loop will terminate
   * even if tools are still being requested") e o texto que sobra é um
   * retrato pela metade. Quem decide TEM que escalar quando isto for true —
   * responder com confiança sobre investigação truncada é pior que não
   * responder.
   */
  truncada: boolean
}

/** Sobrou pedido de ferramenta na última mensagem = o laço foi cortado. */
function ficouPendente(
  content: Anthropic.Beta.Messages.BetaMessage['content'],
): boolean {
  return content.some((b) => b.type === 'tool_use')
}

/**
 * IA privilegiada: tem ferramentas, mas só recebe a ficha da triagem.
 * `userId` e `threadId` vêm do servidor (thread já identificada) — nunca do texto.
 */
export async function investigar(params: {
  triagem: Triagem
  userId: string
  threadId: string
}): Promise<ResultadoInvestigacao | null> {
  const client = getSupportClient()
  if (!client) {
    console.warn('ANTHROPIC_API_KEY ausente — investigação pulada')
    return null
  }

  const runner = client.beta.messages.toolRunner({
    model: MODELO_SUPORTE,
    max_tokens: 8000,
    output_config: { effort: 'medium' },
    tools: criarFerramentas(params.userId, params.threadId, 'ia'),
    max_iterations: 8,
    messages: [
      {
        role: 'user',
        content: montarPromptDeInvestigacao(params.triagem),
      },
    ],
  })

  const finalMessage = await runner.runUntilDone()
  const texto = extrairTexto(finalMessage.content)
  const truncada = ficouPendente(finalMessage.content)
  if (truncada) {
    console.warn(
      `Investigação truncada no teto de rodadas — thread ${params.threadId}`,
    )
  }
  if (!texto) return null
  return { texto, truncada }
}
