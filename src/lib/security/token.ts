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
export function isBearerTokenAuthorizedComTransicao(
  request: NextRequest,
  expectedEnvValue: string | undefined,
  previousEnvValue: string | undefined,
): boolean {
  if (isBearerTokenAuthorized(request, expectedEnvValue)) return true
  if (!previousEnvValue) return false
  return isBearerTokenAuthorized(request, previousEnvValue)
}
