import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SupportThreadPanel,
  type SupportThreadView,
} from '@/components/admin/SupportThreadPanel'

export default async function AdminSuportePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: threads } = await admin
    .from('support_threads')
    .select(`
      id, from_email, subject, status, user_id, db_facts, suggested_reply,
      last_message_at, created_at,
      users ( full_name, email ),
      support_messages (
        id, direction, from_email, body_text, created_at
      )
    `)
    .order('last_message_at', { ascending: false })
    .limit(100)

  const list = (threads ?? []) as unknown as SupportThreadView[]
  const pending = list.filter((t) =>
    ['aguardando_revisao', 'aguardando_dados', 'novo'].includes(t.status)
  )
  const history = list.filter((t) => t.status === 'respondido')

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
          Operações
        </p>
        <h1 className="text-2xl font-bold text-[#13244f]">Suporte</h1>
        <p className="text-sm text-[#13244f]/60 mt-1">
          Revise sugestões antes de enviar. Só o aviso genérico sai sozinho.
        </p>
      </div>

      <SupportThreadPanel pending={pending} history={history} />
    </main>
  )
}
