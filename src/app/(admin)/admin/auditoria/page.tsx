import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/admin/AdminNav'

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-semibold">Admin</h1>
          <AdminNav active="auditoria" />
        </div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">Sair</button>
        </form>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <h2 className="text-xl font-semibold mb-4">Auditoria de prescrições</h2>
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Profissional</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Paciente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Data de assinatura</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Hash do PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Nenhum registro de auditoria ainda.
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {log.professionals?.users?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {log.protocols?.users?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(log.signed_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 break-all">
                      {log.pdf_hash}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
