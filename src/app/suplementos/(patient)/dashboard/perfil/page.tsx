import Image from 'next/image'
import { redirect } from 'next/navigation'
import imgLogoAzul from '@/../public/logo-azul.png'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { ProfileForm } from '@/components/patient/ProfileForm'
import { perguntarAoNucleo } from '@/lib/contrato/nucleo'
import { createClient } from '@/lib/supabase/server'

type Perfil = {
  full_name: string | null
  email: string | null
  phone: string | null
  cpf: string | null
  birth_date: string | null
}

type Endereco = {
  zip_code: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
}

export default async function PerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const [profile, enderecoRes] = await Promise.all([
    perguntarAoNucleo<Perfil>('meu-perfil'),
    perguntarAoNucleo<Endereco | { address: null }>('meu-endereco'),
  ])

  if (!profile) redirect('/suplementos/login')

  const address =
    enderecoRes && !('address' in enderecoRes && enderecoRes.address === null)
      ? (enderecoRes as Endereco)
      : null

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
            full_name: profile.full_name ?? '',
            email: profile.email ?? user.email ?? '',
            phone: profile.phone ?? '',
            cpf: profile.cpf ?? '',
            birth_date: profile.birth_date ?? '',
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
