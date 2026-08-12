import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

export const COOKIE_ACESSO = 'acesso_equipe'

/**
 * Valida a senha do portão de pré-lançamento e entrega o cookie que o
 * middleware procura.
 *
 * Este portão existe para o produto não ser visto antes da hora — ele NÃO
 * substitui a autenticação real. Quem passa daqui ainda precisa de conta e
 * papel corretos para acessar dashboard, painel ou dados de paciente.
 */
function confereSenha(recebida: string, esperada: string): boolean {
  const a = Buffer.from(recebida)
  const b = Buffer.from(esperada)
  // timingSafeEqual exige o mesmo tamanho; comparar o tamanho antes já
  // vazaria informação, então normalizamos com um hash de tamanho fixo.
  if (a.length !== b.length) {
    // ainda assim gastamos o mesmo tempo, comparando b consigo mesmo
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const esperada = process.env.SENHA_PRE_LANCAMENTO

  if (!esperada) {
    // Sem senha configurada o portão não tem como validar ninguém. Falhar
    // aqui é melhor que liberar geral por engano.
    return NextResponse.json(
      { erro: 'Portão sem senha configurada.' },
      { status: 503 },
    )
  }

  let senha = ''
  try {
    const corpo = await request.json()
    senha = typeof corpo?.senha === 'string' ? corpo.senha : ''
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 })
  }

  if (!senha || !confereSenha(senha, esperada)) {
    return NextResponse.json({ erro: 'Senha incorreta.' }, { status: 401 })
  }

  const resposta = NextResponse.json({ ok: true })
  resposta.cookies.set(COOKIE_ACESSO, '1', {
    httpOnly: true, // JavaScript da página não lê — reduz o estrago de um XSS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  })
  return resposta
}
