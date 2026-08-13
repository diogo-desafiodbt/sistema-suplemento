import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type AuditLogRow = {
  id: string
  signed_at: string
  pdf_hash: string
  professionals: {
    users: { full_name: string } | null
  } | null
  protocols: {
    users: { full_name: string } | null
  } | null
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
      id, signed_at, pdf_hash,
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
            </tr>
          </thead>
          <tbody>
            {auditLogs.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-12 text-center text-gray-400 text-sm"
                >
                  Nenhum registro de auditoria ainda.
                </td>
              </tr>
            ) : (
              auditLogs.map((log) => (
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
