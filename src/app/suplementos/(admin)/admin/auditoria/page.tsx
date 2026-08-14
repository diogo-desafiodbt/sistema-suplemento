import { redirect } from 'next/navigation'
import {
  type IntegridadePdf,
  verificarIntegridadePdf,
} from '@/lib/pdf/verificar-integridade'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const { data: logs } = await admin
    .from('prescription_audit_logs')
    .select(`
      id, protocol_id, signed_at, pdf_hash,
      professionals (
        users ( full_name )
      ),
      protocols (
        users ( full_name )
      )
    `)
    .order('signed_at', { ascending: false })
    .limit(100)

  const auditLogs = (logs ?? []) as unknown as AuditLogRow[]
  const protocolIds = [
    ...new Set(auditLogs.map((log) => log.protocol_id).filter(Boolean)),
  ]
  const integridadeEntries = await Promise.all(
    protocolIds.map(async (protocolId) => {
      const estado = await verificarIntegridadePdf(admin, protocolId)
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
