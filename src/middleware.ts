import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'

export const runtime = 'nodejs'

/**
 * Portão de pré-lançamento.
 *
 * Enquanto `SENHA_PRE_LANCAMENTO` existir no ambiente, todo visitante sem o
 * cookie da equipe vê a tela `/em-breve` — o conteúdo real nem chega a ser
 * renderizado. Para desligar o portão inteiro, basta remover a variável de
 * ambiente e reimplantar: nenhuma alteração de código é necessária.
 *
 * Os webhooks (`/api/webhooks/*`, `/api/inngest`) já ficam de fora porque o
 * `matcher` no fim do arquivo os exclui do middleware — ou seja, pedido pago
 * continua chegando com o portão fechado. Isso é essencial: em agosto vocês
 * passaram cinco dias sem a farmácia puxar pedido, e um portão mal colocado
 * reproduziria exatamente esse silêncio.
 */
function portaoFechado(request: NextRequest): boolean {
  if (!process.env.SENHA_PRE_LANCAMENTO) return false
  if (request.cookies.get('acesso_equipe')?.value === '1') return false

  const path = request.nextUrl.pathname
  // A própria tela e o endpoint que valida a senha precisam continuar
  // acessíveis, senão não há como entrar.
  if (path === '/em-breve' || path === '/api/acesso-equipe') return false
  // Arquivos estáticos servidos da pasta public (logo da própria tela).
  if (/\.(png|jpg|jpeg|svg|webp|ico|gif|mp4|woff2?)$/i.test(path)) return false

  return true
}

export async function middleware(request: NextRequest) {
  if (portaoFechado(request)) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/em-breve'
    destino.search = ''
    // rewrite, não redirect: a URL original permanece na barra do navegador
    // e nada do conteúdo real é entregue.
    return NextResponse.rewrite(destino)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'middleware: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar definidas.',
    )
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        supabaseResponse = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAdmin = path.startsWith('/suplementos/admin')
  const isProfessional = path.startsWith('/suplementos/profissional')
  const isDashboard = path.startsWith('/suplementos/dashboard')
  const isProtected = isAdmin || isProfessional || isDashboard

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/suplementos/login'
    return NextResponse.redirect(url)
  }

  if (user && (isAdmin || isProfessional)) {
    const profile = await getUserProfile(user.id)

    if (isAdmin && profile?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/suplementos/dashboard'
      return NextResponse.redirect(url)
    }

    if (
      isProfessional &&
      profile?.role !== 'professional' &&
      profile?.role !== 'admin'
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/suplementos/dashboard'
      return NextResponse.redirect(url)
    }
  }

  if (user && path === '/suplementos/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/suplementos/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest).*)',
  ],
}
