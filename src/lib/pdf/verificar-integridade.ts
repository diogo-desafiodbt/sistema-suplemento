import { createHash } from 'node:crypto'
import { getSql } from '@/lib/db'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * `alterado` é acusação: significa que o documento foi baixado e não confere
 * com o que foi assinado. Não pode ser usado para "não deu pra conferir" —
 * caminho ausente, objeto sumido ou falha de rede viram `indisponivel`.
 *
 * A distinção não é preciosismo: confundir as duas faria uma instabilidade de
 * rede parecer fraude, e a tela de auditoria perderia credibilidade justamente
 * onde ela precisa ser levada a sério.
 */
export type IntegridadePdf =
  | 'integro'
  | 'alterado'
  | 'indisponivel'
  | 'sem_registro'

function hashPdfBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function verificarIntegridadePdf(
  admin: AdminClient,
  protocolId: string,
): Promise<IntegridadePdf> {
  const sql = getSql()
  const logRows = await sql<{ pdf_hash: string | null }[]>`
    SELECT pdf_hash FROM prescription_audit_logs
    WHERE protocol_id = ${protocolId}::uuid
    ORDER BY signed_at DESC
    LIMIT 1
  `
  const storedHash = logRows[0]?.pdf_hash?.trim()
  if (!storedHash) return 'sem_registro'

  const protocolRows = await sql<{ prescription_pdf_path: string | null }[]>`
    SELECT prescription_pdf_path FROM protocols
    WHERE id = ${protocolId}::uuid
    LIMIT 1
  `
  const path = protocolRows[0]?.prescription_pdf_path?.trim()
  if (!path) return 'alterado'

  const { data: file, error } = await admin.storage
    .from('prescricoes')
    .download(path)

  if (error || !file) return 'alterado'

  const atual = hashPdfBuffer(Buffer.from(await file.arrayBuffer()))
  return atual === storedHash ? 'integro' : 'alterado'
}
