import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ProfessionalNav } from '@/components/professional/ProfessionalNav'

type ProtocolItem = {
  is_required: boolean
  removed_by_patient: boolean
  products: { name: string } | null
}

type SignedProtocol = {
  id: string
  status: string
  signed_at: string | null
  users: {
    full_name: string
    email: string
    client_code: string
  } | null
  protocol_items: ProtocolItem[]
}

export default async function AssinadosPage() {
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
      signed_at,
      users (
        full_name,
        email,
        client_code
      ),
      protocol_items (
        is_required,
        removed_by_patient,
        products (
          name
        )
      )
    `)
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })

  const signedProtocols = (protocols ?? []) as unknown as SignedProtocol[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Painel do Profissional</h1>
          <p className="text-sm text-gray-500">{profile?.full_name}</p>
          <ProfessionalNav active="assinados" />
        </div>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">Sair</button>
        </form>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Protocolos assinados</h2>
          <Badge variant="secondary">{signedProtocols.length} assinados</Badge>
        </div>

        {signedProtocols.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            Nenhum protocolo assinado ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {signedProtocols.map(protocol => {
              const activeItems = protocol.protocol_items?.filter(
                item => !item.removed_by_patient
              )
              const signedAt = protocol.signed_at
                ? new Date(protocol.signed_at).toLocaleDateString('pt-BR')
                : '—'

              return (
                <Link
                  key={protocol.id}
                  href={`/profissional/protocolo/${protocol.id}`}
                  className="block bg-white rounded-lg border p-4 hover:border-gray-400 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{protocol.users?.full_name}</span>
                        <span className="text-xs text-gray-400">{protocol.users?.client_code}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap mt-2">
                        {activeItems?.map(item => (
                          <Badge key={item.products?.name} variant="outline" className="text-xs">
                            {item.products?.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge className="bg-green-100 text-green-700 border-0">Assinado</Badge>
                      <p className="text-xs text-gray-400 mt-1">{signedAt}</p>
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
