import Image from 'next/image'
import { redirect } from 'next/navigation'
import imgLogoAzul from '@/../public/logo-azul.png'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { ProfileForm } from '@/components/patient/ProfileForm'
import { getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export default async function PerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const sql = getSql()
  const profileRows = await sql<
    {
      full_name: string | null
      email: string | null
      phone: string | null
      cpf: string | null
      birth_date: string | Date | null
    }[]
  >`
    SELECT full_name, email, phone, cpf, birth_date
    FROM users
    WHERE id = ${user.id}::uuid
    LIMIT 1
  `
  const profile = profileRows[0] ?? null

  const addressRows = await sql<
    {
      zip_code: string
      street: string
      number: string
      complement: string | null
      neighborhood: string
      city: string
      state: string
    }[]
  >`
    SELECT zip_code, street, number, complement, neighborhood, city, state
    FROM addresses
    WHERE user_id = ${user.id}::uuid AND is_default = true
    LIMIT 1
  `
  const address = addressRows[0] ?? null

  const birthDate =
    profile?.birth_date instanceof Date
      ? profile.birth_date.toISOString().slice(0, 10)
      : (profile?.birth_date ?? '')

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between">
        <Image
          src={imgLogoAzul}
          alt="Desafio Diabetes"
          width={455}
          height={355}
          className="h-7 w-auto"
        />
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="text-sm text-[#f4001e] font-medium hover:underline"
          >
            Sair
          </button>
        </form>
      </header>

      <DashboardNav />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
            Sua conta
          </p>
          <h1 className="text-2xl font-bold text-[#13244f]">Meu Perfil</h1>
        </div>

        <ProfileForm
          initialData={{
            full_name: profile?.full_name ?? '',
            email: profile?.email ?? user.email ?? '',
            phone: profile?.phone ?? '',
            cpf: profile?.cpf ?? '',
            birth_date: birthDate,
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
