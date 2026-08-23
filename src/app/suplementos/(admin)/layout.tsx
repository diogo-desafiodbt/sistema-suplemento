import Image from 'next/image'
import { redirect } from 'next/navigation'
import imgLogoBranca from '@/../public/logo-branca.png'
import { AdminNav } from '@/components/admin/AdminNav'
import { getUserProfile } from '@/lib/auth/profile'
import { sessaoAtual } from '@/lib/auth/sessao'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/suplementos/login')

  const profile = await getUserProfile(sessao.userId)
  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-[#13244f] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Image
            src={imgLogoBranca}
            alt="Desafio Diabetes"
            width={455}
            height={355}
            className="h-7 w-auto"
          />
          <span className="text-white/40 text-sm">Admin</span>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="text-sm text-white/60 hover:text-white transition"
          >
            Sair
          </button>
        </form>
      </header>

      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <AdminNav />
      </div>

      {children}
    </div>
  )
}
