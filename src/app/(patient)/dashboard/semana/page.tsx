import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardNav } from '@/components/patient/DashboardNav'

export default async function SemanaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Organização semanal</p>
          <h1 className="text-2xl font-bold text-[#13244f]">Planeje a sua semana</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
          Seu planejamento semanal de dieta e suplementação — em breve.
        </div>
      </main>
    </div>
  )
}
