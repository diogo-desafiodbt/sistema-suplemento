import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { renovar, subDoTokenJwt } from '@/lib/auth/cognito'
import {
  COOKIE_ID,
  COOKIE_REFRESH,
  gravarTokensRenovados,
  limparTokens,
} from '@/lib/auth/cookies'
import { subDoIdTokenVerificado, userIdDoToken } from '@/lib/auth/sessao'
import {
  assinarSessaoSatelite,
  SESSAO_SATELITE_COOKIE,
  SESSAO_SATELITE_MAX_AGE,
} from '@/lib/sessao-satelite'
import { getAppBaseUrl } from '@/lib/url-base'

export const runtime = 'nodejs'

/** Portal (Fase 5): sem DATABASE_URL. Flag explícita — ausência ≠ modo portal. */
function modoPortal(): boolean {
  return process.env.MODO_PORTAL === '1'
}

function portaoFechado(request: NextRequest): boolean {
  if (!process.env.SENHA_PRE_LANCAMENTO) return false
  if (request.cookies.get('acesso_equipe')?.value === '1') return false

  const path = request.nextUrl.pathname
  if (path === '/em-breve' || path === '/api/acesso-equipe') return false
  if (path === '/api/contato') return false
  // O rastreio passa pelo portão fechado. Ele é só escrita — grava um passo
  // anônimo e devolve `ok` — e barrá-lo faz a página de vendas registrar
  // visita zero, que foi o que aconteceu no primeiro teste com link: a origem
  // chegava na Hotmart e o Rastro não via ninguém passar.
  if (path === '/api/funnel/track') return false
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

  const path = request.nextUrl.pathname
  const isAdmin = path.startsWith('/suplementos/admin')
  const isProfessional = path.startsWith('/suplementos/profissional')
  const isDashboard = path.startsWith('/suplementos/dashboard')
  const isProtected = isAdmin || isProfessional || isDashboard

  // --- Portal: JWT verificado basta. Sem tradução para users.id (sem banco). ---
  if (modoPortal()) {
    let sub: string | null = null
    if (idToken) {
      sub = await subDoIdTokenVerificado(idToken)
    }

    if (!sub && idToken && refreshToken) {
      const subJwt = subDoTokenJwt(idToken)
      if (subJwt) {
        const renovados = await renovar(refreshToken, subJwt)
        if (renovados) {
          gravarTokensRenovados(response, renovados)
          idToken = renovados.idToken
          sub = await subDoIdTokenVerificado(renovados.idToken)
        } else {
          limparTokens(response)
          idToken = undefined
        }
      }
    }

    // Este serviço não consegue checar papel: papel mora em `users`, e aqui não
    // há banco. Então ele NEGA as áreas que dependem de papel, em vez de
    // confiar que o ALB nunca vai mandá-las para cá. Regra de ALB é
    // configuração, e configuração muda sem passar por revisão de código.
    if (isAdmin || isProfessional) {
      const dest = new URL('/suplementos/dashboard', getAppBaseUrl())
      dest.search = request.nextUrl.search
      return NextResponse.redirect(dest)
    }

    if (isDashboard && !sub) {
      const dest = new URL('/suplementos/login', getAppBaseUrl())
      dest.search = request.nextUrl.search
      return NextResponse.redirect(dest)
    }

    return response
  }

  // --- Núcleo (e demais serviços com DATABASE_URL): comportamento atual. ---
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
  // `api/funnel/track` fica de fora junto com os webhooks e o Inngest.
  //
  // Ele é anônimo por natureza — grava um passo e devolve `ok` — e não tem o
  // que fazer com sessão. Rodar o caminho de autenticação nele custou caro em
  // 31/08: a página pública passou a chamar essa rota a cada carregamento, e
  // cada chamada tentava traduzir e renovar o token. Quando a renovação
  // falhava, o `limparTokens` mandava um Set-Cookie apagando a sessão — e o
  // navegador obedecia. A pessoa era deslogada por uma chamada de rastreio.
  //
  // A regra que fica: rota anônima de escrita não passa pelo middleware de
  // sessão. Ela não ganha nada e pode destruir a sessão de quem tem uma.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest|api/funnel/track).*)',
  ],
}
