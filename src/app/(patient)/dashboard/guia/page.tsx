import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { DashboardNav } from '@/components/patient/DashboardNav'

export default async function GuiaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: entitlement } = await admin
    .from('user_entitlements')
    .select('id, expires_at')
    .eq('user_id', user.id)
    .eq('product_key', 'guide')
    .eq('status', 'active')
    .maybeSingle()

  if (!entitlement) {
    return (
      <div className="min-h-screen bg-[#f5f0eb]">
        <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between">
          <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="text-sm text-[#f4001e] font-medium hover:underline">Sair</button>
          </form>
        </header>
        <DashboardNav />
        <main className="max-w-3xl mx-auto px-4 py-12 text-center space-y-4">
          <p className="text-4xl">🔒</p>
          <h1 className="text-xl font-bold text-[#13244f]">Guia Digital</h1>
          <p className="text-gray-500 text-sm">Este conteúdo está disponível mediante compra avulsa do Guia Digital.</p>
          <Link href="/recomendacoes" className="inline-block bg-[#f4001e] text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-[#a30000] transition">
            Ver planos
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between">
        <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto" />
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="text-sm text-[#f4001e] font-medium hover:underline">Sair</button>
        </form>
      </header>
      <DashboardNav />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Seu guia</p>
          <h1 className="text-2xl font-bold text-[#13244f]">Guia Digital</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
          Conteúdo do Guia Digital — em breve.
        </div>
      </main>
    </div>
  )
}
