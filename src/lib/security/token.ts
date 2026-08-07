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
