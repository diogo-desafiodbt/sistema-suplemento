import { asNumber, getSql } from '@/lib/db'

const REMETENTES_SISTEMA = new Set([
  'noreply',
  'no-reply',
  'mailer-daemon',
  'postmaster',
])

function localPart(email: string): string {
  return email.trim().toLowerCase().split('@')[0] ?? ''
}

/** Só o carimbo do próprio e-mail — nunca o texto. */
export function eAutomaticoDeclarado(autoSubmitted: string | null): boolean {
  if (autoSubmitted == null) return false
  const valor = autoSubmitted.trim().toLowerCase()
  if (!valor) return false
  return valor !== 'no'
}

export function eRemetenteSistema(email: string): boolean {
  const local = localPart(email)
  if (!local) return false
  if (REMETENTES_SISTEMA.has(local)) return true
  return local.startsWith('noreply') || local.startsWith('no-reply')
}

/** Rede: no máximo 3 respostas automáticas ao mesmo endereço em 24h. */
export async function contarRespostasAutomaticas24h(
  email: string,
): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: string | number }[]>`
    SELECT COUNT(*) AS n
    FROM support_access_log l
    JOIN support_threads t ON t.id = l.thread_id
    WHERE l.ferramenta = 'resposta_automatica'
      AND l.created_at > now() - interval '24 hours'
      AND lower(t.from_email) = ${email.trim().toLowerCase()}
  `
  return asNumber(rows[0]?.n)
}

export async function passouTetoRespostasAutomaticas(
  email: string,
): Promise<boolean> {
  return (await contarRespostasAutomaticas24h(email)) >= 3
}
