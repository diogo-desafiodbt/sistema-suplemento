import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { ProfileForm } from '@/components/patient/ProfileForm'

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users')
    .select('full_name, email, phone, cpf, birth_date')
    .eq('id', user.id)
    .single()

  const { data: address } = await admin
    .from('addresses')
    .select('zip_code, street, number, complement, neighborhood, city, state')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle()

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
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">Sua conta</p>
          <h1 className="text-2xl font-bold text-[#13244f]">Meu Perfil</h1>
        </div>

        <ProfileForm
          initialData={{
            full_name: profile?.full_name ?? '',
            email: profile?.email ?? user.email ?? '',
            phone: profile?.phone ?? '',
            cpf: profile?.cpf ?? '',
            birth_date: profile?.birth_date ?? '',
            address: {
              zip_code: address?.zip_code ?? '',
              street: address?.street ?? '',
              number: address?.number ?? '',
              complement: address?.complement ?? '',
              neighborhood: address?.neighborhood ?? '',
              city: address?.city ?? '',
              state: address?.state ?? '',
            },
          }}
        />
      </main>
    </div>
  )
}
