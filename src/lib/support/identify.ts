import { getSql } from '@/lib/db'

/**
 * Quem escreveu, decidido SÓ pelo remetente.
 *
 * Antes, isto também casava qualquer e-mail ou CPF encontrado no CORPO da
 * mensagem. Quer dizer: bastava escrever "meu e-mail é maria@gmail.com" para
 * ser identificado como a Maria — e a partir daí tudo que o suporte
 * consultasse seria o dado dela.
 *
 * É a mesma regra que vale no portal e nos satélites: **nunca aceitar "de
 * quem" como parâmetro**. No portal o dono vem da sessão; aqui vem do
 * envelope do e-mail. Corpo de mensagem é texto de estranho, nunca
 * identidade.
 *
 * O remetente também não é prova forte — e-mail se falsifica. Mas é a única
 * coisa que o cliente não controla livremente ao escrever, e é o que sustenta
 * a regra de o robô nunca responder a quem não foi identificado.
 */
export async function identifySupportUser(
  fromEmail: string,
): Promise<string | null> {
  const email = fromEmail?.trim().toLowerCase()
  if (!email) return null

  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1
  `
  return rows[0]?.id ?? null
}
