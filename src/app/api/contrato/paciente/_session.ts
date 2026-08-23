import { NextResponse } from 'next/server'
import { sessaoAtual } from '@/lib/auth/sessao'

/** Sessão validada no núcleo — o dono nunca vem do request. */
export async function requirePacienteSession(): Promise<
  { userId: string } | { response: NextResponse }
> {
  const sessao = await sessaoAtual()

  if (!sessao) {
    return {
      response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }),
    }
  }

  return { userId: sessao.userId }
}

export function isoDate(
  value: string | Date | null | undefined,
): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function isoDateOnly(
  value: string | Date | null | undefined,
): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value)
  return s.length >= 10 ? s.slice(0, 10) : s
}
