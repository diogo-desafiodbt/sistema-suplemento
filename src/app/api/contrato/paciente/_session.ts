import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Sessão validada no núcleo — o dono nunca vem do request. */
export async function requirePacienteSession(): Promise<
  { userId: string } | { response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }),
    }
  }

  return { userId: user.id }
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
