import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ProfessionalNav } from '@/components/professional/ProfessionalNav'

type ProtocolItem = {
  is_required: boolean
  removed_by_patient: boolean
  products: { name: string } | null
}

type PendingProtocol = {
  id: string
  status: string
  generated_at: string
  users: {
    full_name: string
    email: string
    client_code: string
  } | null
  quiz_responses: {
    diagnosis_type: string
    years_diagnosed: string
    medications: string[]
    symptoms: string[]
    conditions_serious: string[]
  } | null
  protocol_items: ProtocolItem[]
}

export default async function FilaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'professional' && profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  const admin = createAdminClient()

  const { data: protocols } = await admin
    .from('protocols')
    .select(`
      id,
      status,
      generated_at,
      users (
        full_name,
        email,
        client_code
      ),
      quiz_responses (
        diagnosis_type,
        years_diagnosed,
        medications,
        symptoms,
        conditions_serious
      ),
      protocol_items (
        is_required,
        removed_by_patient,
        products (
          name
        )
      )
    `)
    .eq('status', 'pending_signature')
    .order('generated_at', { ascending: true })

  const pendingProtocols = (protocols ?? []) as unknown as PendingProtocol[]

  return (
    <div className="min-h-screen bg-[#f5f0eb]">

      {/* Header */}
      <header className="bg-[#13244f] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <img src="/logo-branca.png" alt="Desafio Diabetes" className="h-7 w-auto" />
              <span className="text-white/40 text-sm">Área do Profissional</span>
            </div>
            <ProfessionalNav />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white/60 text-sm hidden sm:block">{profile?.full_name}</span>
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="text-sm text-white/60 hover:text-white transition">Sair</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Fila de assinatura</p>
            <h1 className="text-2xl font-bold text-[#13244f]">Prescrições pendentes</h1>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-700">
            {pendingProtocols.length} pendente{pendingProtocols.length !== 1 ? 's' : ''}
          </span>
        </div>

        {pendingProtocols.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-4xl mb-3">✓</p>
            <p className="text-[#13244f] font-semibold">Nenhuma prescrição pendente</p>
            <p className="text-gray-400 text-sm mt-1">Todas as prescrições foram assinadas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingProtocols.map(protocol => {
              const activeItems = protocol.protocol_items?.filter(item => !item.removed_by_patient)
              const generatedAt = new Date(protocol.generated_at).toLocaleDateString('pt-BR')

              return (
                <Link
                  key={protocol.id}
                  href={`/profissional/protocolo/${protocol.id}`}
                  className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-[#13244f]/30 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-[#13244f]">{protocol.users?.full_name}</span>
                        <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{protocol.users?.client_code}</span>
                      </div>
                      <p className="text-sm text-gray-400">{protocol.users?.email}</p>
                      <div className="flex gap-2 flex-wrap">
                        {activeItems?.map(item => (
                          <span key={item.products?.name} className="text-xs bg-[#13244f]/5 text-[#13244f] font-medium px-2.5 py-1 rounded-full border border-[#13244f]/10">
                            {item.products?.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 block">
                        Pendente
                      </span>
                      <p className="text-xs text-gray-400">{generatedAt}</p>
                      <p className="text-xs text-[#f4001e] font-semibold">Assinar →</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
