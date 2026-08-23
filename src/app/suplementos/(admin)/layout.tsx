import Image from 'next/image'
import { Roboto } from 'next/font/google'
import { redirect } from 'next/navigation'
import imgLogoBranca from '@/../public/logo-branca.png'
import { AdminNav } from '@/components/admin/AdminNav'
import { getUserProfile } from '@/lib/auth/profile'
import { sessaoAtual } from '@/lib/auth/sessao'
import './admin.css'

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
})

function iniciais(nome: string | null | undefined, email: string | null): string {
  const base = (nome && nome.trim()) || (email && email.trim()) || '?'
  const partes = base.split(/\s+/).filter(Boolean)
  if (partes.length >= 2) {
    return `${partes[0]![0]}${partes[1]![0]}`.toUpperCase()
  }
  return base.slice(0, 2).toUpperCase()
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/suplementos/login')

  const profile = await getUserProfile(sessao.userId)
  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const nome =
    profile?.full_name?.trim() || sessao.email?.trim() || 'Admin'
  const letras = iniciais(profile?.full_name, sessao.email)

  return (
    <div className={`admin-shell ${roboto.variable} ${roboto.className}`}>
      <aside className="admin-lateral" aria-label="Menu do admin">
        <div className="admin-lateral-marca">
          <Image
            src={imgLogoBranca}
            alt="Desafio Diabetes"
            width={455}
            height={355}
            className="h-6 w-auto"
          />
          <span>Admin</span>
        </div>
        <AdminNav />
      </aside>

      <div className="admin-corpo">
        <header className="admin-topo">
          <input
            type="search"
            className="admin-busca"
            placeholder="Buscar…"
            aria-label="Buscar"
            disabled
            title="Em breve"
          />
          <div className="admin-topo-direita">
            {/* Contador de alertas omitido: consulta a cada navegação. Cache depois. */}
            <span className="admin-sino" aria-label="Notificações" title="Alertas">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            <div className="admin-usuario">
              <span className="admin-usuario-iniciais" aria-hidden>
                {letras}
              </span>
              <span className="admin-usuario-nome">{nome}</span>
            </div>
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="admin-sair">
                Sair
              </button>
            </form>
          </div>
        </header>

        <div className="admin-conteudo">{children}</div>
      </div>
    </div>
  )
}
