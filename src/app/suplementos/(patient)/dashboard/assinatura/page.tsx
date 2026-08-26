import Image from 'next/image'
import { redirect } from 'next/navigation'
import imgLogoAzul from '@/../public/logo-azul.png'
import { AssinaturaClient } from '@/components/patient/AssinaturaClient'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { NAO_ENCONTRADO, perguntarAoNucleo } from '@/lib/contrato/nucleo'

type Assinatura = {
  id: string
  plan_type: string
  status: string
  expires_at: string | null
  grace_period_ends_at: string | null
  pagarme_sub_id: string | null
}

type PagamentosRes = {
  payments: Array<{
    id: string
    amount: number | null
    status: string
    paid_at: string | null
  }>
}

export default async function AssinaturaPage() {
  const [assinaturaRes, pagamentosRes] = await Promise.all([
    perguntarAoNucleo<Assinatura | { subscription: null }>('minha-assinatura'),
    perguntarAoNucleo<PagamentosRes>('meus-pagamentos'),
  ])

  if (
    assinaturaRes == null ||
    pagamentosRes == null ||
    assinaturaRes === NAO_ENCONTRADO ||
    pagamentosRes === NAO_ENCONTRADO
  ) {
    redirect('/suplementos/login')
  }

  const subscription =
    'subscription' in assinaturaRes && assinaturaRes.subscription === null
      ? null
      : (assinaturaRes as Assinatura)

  const payments = pagamentosRes.payments

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
            Sua assinatura
          </p>
          <h1 className="text-2xl font-bold text-[#13244f]">
            Minha Assinatura
          </h1>
        </div>

        <AssinaturaClient subscription={subscription} payments={payments} />
      </main>
    </div>
  )
}
