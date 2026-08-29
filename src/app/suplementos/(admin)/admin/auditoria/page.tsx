import { exigirAdmin } from '@/lib/auth/admin'
import { redirect } from 'next/navigation'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { Tabela } from '@/components/admin/ui/Tabela'
import { Vazio } from '@/components/admin/ui/Vazio'
import { getSql } from '@/lib/db'
import {
  type IntegridadePdf,
  verificarIntegridadePdf,
} from '@/lib/pdf/verificar-integridade'

type AuditLogRow = {
  id: string
  protocol_id: string
  signed_at: string
  pdf_hash: string
  professionals: {
    users: { full_name: string } | null
  } | null
  protocols: {
    users: { full_name: string } | null
  } | null
}

const INTEGRIDADE_LABEL: Record<IntegridadePdf, string> = {
  integro: 'Íntegro',
  alterado: 'Alterado',
  indisponivel: 'Não verificável',
  sem_registro: 'Sem registro',
}

function tomIntegridade(
  estado: IntegridadePdf,
): 'ok' | 'perigo' | 'atencao' | 'neutro' {
  if (estado === 'integro') return 'ok'
  if (estado === 'alterado') return 'perigo'
  if (estado === 'indisponivel') return 'atencao'
  return 'neutro'
}

export default async function AdminAuditoriaPage() {
  await exigirAdmin()

  const sql = getSql()
  const auditLogs = await sql<AuditLogRow[]>`
    SELECT l.id, l.protocol_id, l.signed_at, l.pdf_hash,
      CASE WHEN pf.id IS NULL THEN NULL ELSE jsonb_build_object(
        'users', CASE WHEN pu.id IS NULL THEN NULL
          ELSE jsonb_build_object('full_name', pu.full_name) END) END AS professionals,
      CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
        'users', CASE WHEN ou.id IS NULL THEN NULL
          ELSE jsonb_build_object('full_name', ou.full_name) END) END AS protocols
    FROM prescription_audit_logs l
    LEFT JOIN professionals pf ON pf.id = l.professional_id
    LEFT JOIN users pu ON pu.id = pf.user_id
    LEFT JOIN protocols p ON p.id = l.protocol_id
    LEFT JOIN users ou ON ou.id = p.user_id
    ORDER BY l.signed_at DESC
    LIMIT 100
  `
  const protocolIds = [
    ...new Set(auditLogs.map((log) => log.protocol_id).filter(Boolean)),
  ]
  const integridadeEntries = await Promise.all(
    protocolIds.map(async (protocolId) => {
      const estado = await verificarIntegridadePdf(protocolId)
      return [protocolId, estado] as const
    }),
  )
  const integridadePorProtocolo = Object.fromEntries(integridadeEntries) as Record<
    string,
    IntegridadePdf
  >

  return (
    <div>
      <CabecaDePagina
        trilha="Clínico / Auditoria"
        titulo="Auditoria"
        acao={
          <span className="admin-num" style={{ color: 'var(--admin-tinta-fraca)', fontSize: 14 }}>
            {auditLogs.length} registros
          </span>
        }
      />

      <Card className="!p-0 overflow-hidden">
        {auditLogs.length === 0 ? (
          <Vazio
            titulo="Nenhum registro de auditoria"
            explicacao="Assinaturas de prescrição ainda não geraram trilha. Cada PDF assinado aparece aqui com o hash para conferência."
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Profissional</th>
                <th>Paciente</th>
                <th>Data de assinatura</th>
                <th>Hash do PDF</th>
                <th>Integridade</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => {
                const estado =
                  integridadePorProtocolo[log.protocol_id] ?? 'sem_registro'
                return (
                  <tr key={log.id}>
                    <td className="admin-nome">
                      {log.professionals?.users?.full_name ?? '—'}
                    </td>
                    <td className="admin-nome">
                      {log.protocols?.users?.full_name ?? '—'}
                    </td>
                    <td className="admin-num admin-sub">
                      {new Date(log.signed_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="admin-mono">{log.pdf_hash}</td>
                    <td>
                      <Selo tom={tomIntegridade(estado)}>
                        {INTEGRIDADE_LABEL[estado]}
                      </Selo>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        )}
      </Card>
    </div>
  )
}
