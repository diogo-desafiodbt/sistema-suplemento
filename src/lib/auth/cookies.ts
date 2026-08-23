import { type NextResponse } from 'next/server'

export const COOKIE_ID = 'dd_id'
export const COOKIE_ACCESS = 'dd_access'
export const COOKIE_REFRESH = 'dd_refresh'

const OPCOES = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
}

const MAX_ID = 60 * 60
const MAX_REFRESH = 30 * 24 * 60 * 60

export function gravarTokens(
  response: NextResponse,
  tokens: {
    idToken: string
    accessToken: string
    refreshToken: string
  },
) {
  response.cookies.set(COOKIE_ID, tokens.idToken, {
    ...OPCOES,
    maxAge: MAX_ID,
  })
  response.cookies.set(COOKIE_ACCESS, tokens.accessToken, {
    ...OPCOES,
    maxAge: MAX_ID,
  })
  response.cookies.set(COOKIE_REFRESH, tokens.refreshToken, {
    ...OPCOES,
    maxAge: MAX_REFRESH,
  })
}

export function gravarTokensRenovados(
  response: NextResponse,
  tokens: { idToken: string; accessToken: string },
) {
  response.cookies.set(COOKIE_ID, tokens.idToken, {
    ...OPCOES,
    maxAge: MAX_ID,
  })
  response.cookies.set(COOKIE_ACCESS, tokens.accessToken, {
    ...OPCOES,
    maxAge: MAX_ID,
  })
}

export function limparTokens(response: NextResponse) {
  for (const nome of [COOKIE_ID, COOKIE_ACCESS, COOKIE_REFRESH]) {
    response.cookies.set(nome, '', { ...OPCOES, maxAge: 0 })
  }
}
