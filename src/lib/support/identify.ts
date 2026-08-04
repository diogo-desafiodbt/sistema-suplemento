import { createAdminClient } from '@/lib/supabase/admin'

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** Escapa `%`, `_` e `\` pra uso seguro em padrões LIKE/ILIKE. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_RE) ?? []
  return Array.from(new Set(matches.map((e) => e.toLowerCase())))
}

export function extractCpfs(text: string): string[] {
  const matches = text.match(CPF_RE) ?? []
  return Array.from(
    new Set(matches.map(digitsOnly).filter((c) => c.length === 11))
  )
}

/** Tenta casar from_email + e-mails/CPFs no corpo com users. */
export async function identifySupportUser(params: {
  fromEmail: string
  bodyTexts: string[]
}): Promise<string | null> {
  const admin = createAdminClient()
  const combined = [params.fromEmail, ...params.bodyTexts].join('\n')
  const emails = Array.from(
    new Set([params.fromEmail.toLowerCase(), ...extractEmails(combined)])
  )
  const cpfs = extractCpfs(combined)

  for (const email of emails) {
    const { data } = await admin
      .from('users')
      .select('id')
      .ilike('email', escapeLikePattern(email))
      .limit(1)
      .maybeSingle()
    if (data?.id) return data.id
  }

  for (const cpf of cpfs) {
    const { data: exact } = await admin
      .from('users')
      .select('id')
      .eq('cpf', cpf)
      .limit(1)
      .maybeSingle()
    if (exact?.id) return exact.id

    // CPF pode estar formatado no banco
    const formatted = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    const { data: formattedRow } = await admin
      .from('users')
      .select('id')
      .eq('cpf', formatted)
      .limit(1)
      .maybeSingle()
    if (formattedRow?.id) return formattedRow.id
  }

  return null
}
