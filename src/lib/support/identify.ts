import { getSql } from '@/lib/db'

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_RE) ?? []
  return Array.from(new Set(matches.map((e) => e.toLowerCase())))
}

function extractCpfs(text: string): string[] {
  const matches = text.match(CPF_RE) ?? []
  return Array.from(
    new Set(matches.map(digitsOnly).filter((c) => c.length === 11)),
  )
}

/** Tenta casar from_email + e-mails/CPFs no corpo com users. */
export async function identifySupportUser(params: {
  fromEmail: string
  bodyTexts: string[]
}): Promise<string | null> {
  const sql = getSql()
  const combined = [params.fromEmail, ...params.bodyTexts].join('\n')
  const emails = Array.from(
    new Set([params.fromEmail.toLowerCase(), ...extractEmails(combined)]),
  )
  const cpfs = extractCpfs(combined)

  for (const email of emails) {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM users
      WHERE lower(email) = ${email.toLowerCase()}
      LIMIT 1
    `
    if (rows[0]?.id) return rows[0].id
  }

  for (const cpf of cpfs) {
    const exact = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE cpf = ${cpf} LIMIT 1
    `
    if (exact[0]?.id) return exact[0].id

    const formatted = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    const formattedRows = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE cpf = ${formatted} LIMIT 1
    `
    if (formattedRows[0]?.id) return formattedRows[0].id
  }

  return null
}
