import { type NextRequest, NextResponse } from 'next/server'
import { renovar, sair, subDoTokenJwt } from '@/lib/auth/cognito'
import {
  COOKIE_ACCESS,
  limparTokens,
} from '@/lib/auth/cookies'

export async function POST(request: NextRequest) {
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: '/suplementos/login' },
  })

  const accessToken = request.cookies.get(COOKIE_ACCESS)?.value
  if (accessToken) {
    await sair(accessToken)
  }

  limparTokens(response)
  response.cookies.set('sessao_satelite', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
