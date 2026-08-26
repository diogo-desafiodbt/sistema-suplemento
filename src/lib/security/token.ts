import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/** Compara secrets de tamanho variável sem vazamento por timing. */
function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Ainda compara contra si pra tempo roughly constante no branch.
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

/**
 * Aceita `Authorization: Bearer <token>`.
 * Query `?token=` só se `allowQueryToken` (legado Pagar.me dashboard).
 */
export function isBearerOrQueryTokenAuthorized(
  request: NextRequest,
  expectedEnvValue: string | undefined,
  options?: { allowQueryToken?: boolean },
): boolean {
  if (!expectedEnvValue) return false

  const header = request.headers.get('authorization') ?? ''
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearer && safeEqualString(bearer, expectedEnvValue)) return true

  if (options?.allowQueryToken !== false) {
    const queryToken = request.nextUrl.searchParams.get('token')
    if (queryToken && safeEqualString(queryToken, expectedEnvValue)) return true
  }

  return false
}

/** Preferido para webhooks novos — só header Authorization. */
export function isBearerTokenAuthorized(
  request: NextRequest,
  expectedEnvValue: string | undefined,
): boolean {
  return isBearerOrQueryTokenAuthorized(request, expectedEnvValue, {
    allowQueryToken: false,
  })
}

/**
 * Aceita o token novo ou o anterior, para trocar credencial com um parceiro
 * sem combinar o minuto exato da virada.
 *
 * O problema que isto resolve: no instante em que gravamos a credencial nova,
 * o parceiro passa a ser recusado até atualizar o painel dele. Já custou cinco
 * dias sem a farmácia puxar pedido. Com os dois aceitos, ele troca quando
 * puder e nada para no meio.
 *
 * A janela é temporária por construção: enquanto `...\_ANTERIOR` existir no
 * ambiente, a credencial velha continua valendo. **Apagar a variável fecha a
 * janela**, sem deploy de código — e é o que deve ser feito assim que o
 * parceiro confirmar a troca. Deixá-la para sempre anula a rotação.
 */
/**
 * Aceita o token no cabeçalho OU na query, com a janela de troca.
 *
 * Existe por uma limitação de fornecedor, não por preferência: a Envie Agora
 * informou em 26/08/2026 que ainda não implementou credencial em cabeçalho nos
 * webhooks deles, e ofereceu query string até implementarem.
 *
 * Por que aceitamos aqui e em mais lugar nenhum:
 *
 * O que este webhook faz é estreito — marca como despachado um pedido QUE JÁ
 * EXISTE, localizado por um identificador que nós geramos e mandamos para
 * eles. Não lê dado de cliente, não muda endereço, não toca em pagamento. Com
 * o token na mão, o pior que alguém faz é marcar despacho falso e disparar um
 * aviso ao cliente.
 *
 * E o vazamento por log, que é a objeção real contra query string, não
 * acontece do nosso lado: conferido em 26/08, nem o balanceador nem a CDN
 * gravam log de acesso, e o nosso código não registra a URL. Sobra o log
 * deles, que não controlamos — e é por isso que este token é separado dos
 * outros e some quando eles implementarem cabeçalho.
 *
 * NÃO use isto em rota nova. Se precisar, o raciocínio inteiro acima tem que
 * ser refeito para o caso novo.
 */
export function isTokenDeParceiroSemCabecalho(
  request: NextRequest,
  expectedEnvValue: string | undefined,
  previousEnvValue: string | undefined,
): boolean {
  const opcoes = { allowQueryToken: true }
  if (isBearerOrQueryTokenAuthorized(request, expectedEnvValue, opcoes)) {
    return true
  }
  return isBearerOrQueryTokenAuthorized(request, previousEnvValue, opcoes)
}

export function isBearerTokenAuthorizedComTransicao(
  request: NextRequest,
  expectedEnvValue: string | undefined,
  previousEnvValue: string | undefined,
): boolean {
  if (isBearerTokenAuthorized(request, expectedEnvValue)) return true
  if (!previousEnvValue) return false
  return isBearerTokenAuthorized(request, previousEnvValue)
}
