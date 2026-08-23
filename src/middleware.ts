import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { renovar, subDoTokenJwt } from '@/lib/auth/cognito'
import {
  COOKIE_ACCESS,
  COOKIE_ID,
  COOKIE_REFRESH,
  gravarTokensRenovados,
  limparTokens,
} from '@/lib/auth/cookies'
import { userIdDoToken } from '@/lib/auth/sessao'
import {
  assinarSessaoSatelite,
  SESSAO_SATELITE_COOKIE,
  SESSAO_SATELITE_MAX_AGE,
} from '@/lib/sessao-satelite'
import { getAppBaseUrl } from '@/lib/url-base'

export const runtime = 'nodejs'

function portaoFechado(request: NextRequest): boolean {
  if (!process.env.SENHA_PRE_LANCAMENTO) return false
  if (request.cookies.get('acesso_equipe')?.value === '1') return false

  const path = request.nextUrl.pathname
  if (path === '/em-breve' || path === '/api/acesso-equipe') return false
  if (path === '/api/contato') return false
  if (/\.(png|jpg|jpeg|svg|webp|ico|gif|mp4|woff2?)$/i.test(path)) return false

  return true
}

export async function middleware(request: NextRequest) {
  if (portaoFechado(request)) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/em-breve'
    destino.search = ''
    return NextResponse.rewrite(destino)
  }

  let response = NextResponse.next({ request })

  let idToken = request.cookies.get(COOKIE_ID)?.value
  const refreshToken = request.cookies.get(COOKIE_REFRESH)?.value

  let userId: string | null = null
  if (idToken) {
    userId = await userIdDoToken(idToken)
  }

  if (!userId && idToken && refreshToken) {
    const sub = subDoTokenJwt(idToken)
    if (sub) {
      const renovados = await renovar(refreshToken, sub)
      if (renovados) {
        gravarTokensRenovados(response, renovados)
        idToken = renovados.idToken
        userId = await userIdDoToken(renovados.idToken)
      } else {
        limparTokens(response)
        idToken = undefined
      }
    }
  }

  const path = request.nextUrl.pathname
  const isAdmin = path.startsWith('/suplementos/admin')
  const isProfessional = path.startsWith('/suplementos/profissional')
  const isDashboard = path.startsWith('/suplementos/dashboard')
  const isProtected = isAdmin || isProfessional || isDashboard

  if (isProtected && !userId) {
    const dest = new URL('/suplementos/login', getAppBaseUrl())
    dest.search = request.nextUrl.search
    return NextResponse.redirect(dest)
  }

  if (userId && (isAdmin || isProfessional)) {
    const profile = await getUserProfile(userId)

    if (isAdmin && profile?.role !== 'admin') {
      const dest = new URL('/suplementos/dashboard', getAppBaseUrl())
      dest.search = request.nextUrl.search
      return NextResponse.redirect(dest)
    }

    if (isAdmin && profile?.role === 'admin') {
      response.cookies.set(
        SESSAO_SATELITE_COOKIE,
        assinarSessaoSatelite(userId, profile.role),
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: SESSAO_SATELITE_MAX_AGE,
        },
      )
    }

    if (
      isProfessional &&
      profile?.role !== 'professional' &&
      profile?.role !== 'admin'
    ) {
      const dest = new URL('/suplementos/dashboard', getAppBaseUrl())
      dest.search = request.nextUrl.search
      return NextResponse.redirect(dest)
    }
  }

  if (userId && path === '/suplementos/login') {
    const dest = new URL('/suplementos/dashboard', getAppBaseUrl())
    dest.search = request.nextUrl.search
    return NextResponse.redirect(dest)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest).*)',
  ],
}
