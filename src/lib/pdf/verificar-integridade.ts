import { createHash } from 'node:crypto'
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
  const { data: log } = await admin
    .from('prescription_audit_logs')
    .select('pdf_hash')
    .eq('protocol_id', protocolId)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const storedHash = log?.pdf_hash?.trim()
  if (!storedHash) return 'sem_registro'

  const { data: protocol } = await admin
    .from('protocols')
    .select('prescription_pdf_path')
    .eq('id', protocolId)
    .maybeSingle()

  const path = protocol?.prescription_pdf_path?.trim()
  if (!path) return 'alterado'

  const { data: file, error } = await admin.storage
    .from('prescricoes')
    .download(path)

  if (error || !file) return 'alterado'

  const atual = hashPdfBuffer(Buffer.from(await file.arrayBuffer()))
  return atual === storedHash ? 'integro' : 'alterado'
}
