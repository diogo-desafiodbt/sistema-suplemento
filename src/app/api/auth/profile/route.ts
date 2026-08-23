import { NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth/profile'
import { sessaoAtual } from '@/lib/auth/sessao'

export async function GET() {
  const sessao = await sessaoAtual()

  if (!sessao) {
    return NextResponse.json({ profile: null }, { status: 401 })
  }

  const profile = await getUserProfile(sessao.userId)
  return NextResponse.json({ profile })
}
