// Ponto único de leitura de sessão — hoje Supabase, amanhã Cognito.
// Quem precisar saber quem está logado importa daqui; o resto do sistema
// não fica sabendo quando o motor trocar.

import { createClient } from '@/lib/supabase/server'

export type Sessao = { userId: string; email: string | null }

/** Quem está logado nesta requisição, ou null. */
export async function sessaoAtual(): Promise<Sessao | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  return {
    userId: user.id,
    email: user.email ?? null,
  }
}
