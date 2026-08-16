import Image from 'next/image'
import { redirect } from 'next/navigation'
import imgLogoAzul from '@/../public/logo-azul.png'
import { AssinaturaClient } from '@/components/patient/AssinaturaClient'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { asNumber, getSql } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export default async function AssinaturaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const sql = getSql()
  const subscriptionRows = await sql<
    {
      id: string
      plan_type: string
      status: string
      expires_at: string | Date | null
      grace_period_ends_at: string | Date | null
      pagarme_sub_id: string | null
    }[]
  >`
    SELECT id, plan_type, status, expires_at, grace_period_ends_at, pagarme_sub_id
    FROM subscriptions
    WHERE user_id = ${user.id}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `
  const sub = subscriptionRows[0] ?? null
  const subscription = sub
    ? {
        ...sub,
        expires_at:
          sub.expires_at instanceof Date
            ? sub.expires_at.toISOString()
            : sub.expires_at,
        grace_period_ends_at:
          sub.grace_period_ends_at instanceof Date
            ? sub.grace_period_ends_at.toISOString()
            : sub.grace_period_ends_at,
      }
    : null

  const paymentRows = subscription
    ? await sql<
        {
          id: string
          amount: string | number | null
          status: string
          paid_at: string | Date | null
        }[]
      >`
        SELECT id, amount, status, paid_at FROM payments
        WHERE subscription_id = ${subscription.id}::uuid
        ORDER BY paid_at DESC NULLS LAST
        LIMIT 5
      `
    : []

  const payments = paymentRows.map((p) => ({
    id: p.id,
    amount: p.amount == null ? null : asNumber(p.amount),
    status: p.status,
    paid_at:
      p.paid_at instanceof Date ? p.paid_at.toISOString() : p.paid_at,
  }))

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
