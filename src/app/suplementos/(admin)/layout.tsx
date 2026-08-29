import Image from 'next/image'
import imgLogoAzul from '@/../public/logo-azul.png'
import { AdminNav } from '@/components/admin/AdminNav'
import { BuscaGlobal } from '@/components/admin/BuscaGlobal'
import { MenuMobile } from '@/components/admin/MenuMobile'
import { exigirAdmin } from '@/lib/auth/admin'
import './admin.css'

// A tipografia e a do sistema — no Mac isso entrega a SF Pro. Alem de ser a
// escolha visual, some com o download da Roboto em toda navegacao.

function iniciais(
  nome: string | null | undefined,
  email: string | null,
): string {
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
  const admin = await exigirAdmin()

  const nome = admin.fullName?.trim() || admin.email?.trim() || 'Admin'
  const letras = iniciais(admin.fullName, admin.email)

  return (
    <div className="admin-shell">
      <aside className="admin-lateral" aria-label="Menu do admin">
        <div className="admin-lateral-marca">
          {/* A logo branca sumiria na lateral clara. */}
          <Image
            src={imgLogoAzul}
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
          <MenuMobile />
          <BuscaGlobal />
          <div className="admin-topo-direita">
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
