import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import {
  type IntegridadePdf,
  verificarIntegridadePdf,
} from '@/lib/pdf/verificar-integridade'
import { sessaoAtual } from '@/lib/auth/sessao'

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

const INTEGRIDADE_BADGE: Record<IntegridadePdf, string> = {
  integro: 'bg-green-50 text-green-700',
  alterado: 'bg-red-50 text-red-700',
  // Âmbar, não vermelho: não conferimos, e isso é diferente de acusar.
  indisponivel: 'bg-amber-50 text-amber-700',
  sem_registro: 'bg-gray-100 text-gray-600',
}

export default async function AdminAuditoriaPage() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/suplementos/login')

  const profile = await getUserProfile(sessao.userId)

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

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
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
            Compliance
          </p>
          <h1 className="text-2xl font-bold text-[#13244f]">
            Auditoria de prescrições
          </h1>
        </div>
        <span className="text-sm text-gray-400">
          {auditLogs.length} registros
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Profissional
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Paciente
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Data de assinatura
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Hash do PDF
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Integridade
              </th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-12 text-center text-gray-400 text-sm"
                >
                  Nenhum registro de auditoria ainda.
                </td>
              </tr>
            ) : (
              auditLogs.map((log) => {
                const estado =
                  integridadePorProtocolo[log.protocol_id] ?? 'sem_registro'
                return (
                <tr
                  key={log.id}
                  className="border-b border-gray-50 hover:bg-[#f5f0eb]/50 transition-colors"
                >
                  <td className="px-5 py-4 font-semibold text-[#13244f]">
                    {log.professionals?.users?.full_name ?? '—'}
                  </td>
                  <td className="px-5 py-4 font-semibold text-[#13244f]">
                    {log.protocols?.users?.full_name ?? '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {new Date(log.signed_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-400 break-all max-w-xs">
                    {log.pdf_hash}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${INTEGRIDADE_BADGE[estado]}`}
                    >
                      {INTEGRIDADE_LABEL[estado]}
                    </span>
                  </td>
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
