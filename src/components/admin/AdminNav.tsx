'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

type Item = { label: string; href: string; icone: ReactNode }

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      className="admin-nav-icone"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

const grupos: { titulo: string; itens: Item[] }[] = [
  {
    titulo: 'Operação',
    itens: [
      {
        label: 'Visão Geral',
        href: '/suplementos/admin',
        icone: (
          <Icone>
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
          </Icone>
        ),
      },
      {
        label: 'Pedidos',
        href: '/suplementos/admin/pedidos',
        icone: (
          <Icone>
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </Icone>
        ),
      },
      {
        label: 'Suporte',
        href: '/suplementos/admin/suporte',
        icone: (
          <Icone>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </Icone>
        ),
      },
      {
        label: 'Alertas',
        href: '/suplementos/admin/alertas',
        icone: (
          <Icone>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </Icone>
        ),
      },
    ],
  },
  {
    titulo: 'Comercial',
    itens: [
      {
        label: 'Rastro',
        href: '/suplementos/admin/rastro',
        icone: (
          <Icone>
            <path d="M3 3v18h18" />
            <path d="M7 15l4-4 3 3 5-6" />
          </Icone>
        ),
      },
      {
        label: 'Leads',
        href: '/suplementos/admin/comercial',
        icone: (
          <Icone>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </Icone>
        ),
      },
    ],
  },
  {
    titulo: 'Clínico',
    itens: [
      {
        label: 'Clientes',
        href: '/suplementos/admin/clientes',
        icone: (
          <Icone>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </Icone>
        ),
      },
      {
        label: 'Auditoria',
        href: '/suplementos/admin/auditoria',
        icone: (
          <Icone>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </Icone>
        ),
      },
    ],
  },
  {
    titulo: 'Ajustes',
    itens: [
      {
        label: 'Cupons',
        href: '/suplementos/admin/cupons',
        icone: (
          <Icone>
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <path d="M7 7h.01" />
          </Icone>
        ),
      },
      {
        label: 'Config',
        href: '/suplementos/admin/config',
        icone: (
          <Icone>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </Icone>
        ),
      },
      {
        label: 'Histórico',
        href: '/suplementos/admin/historico',
        icone: (
          <Icone>
            <path d="M3 3v18h18" />
            <path d="M7 15l4-5 3 3 5-7" />
          </Icone>
        ),
      },
      {
        label: 'Segurança',
        href: '/suplementos/admin/seguranca',
        icone: (
          <Icone>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </Icone>
        ),
      },
      {
        label: 'Usuários',
        href: '/suplementos/admin/usuarios',
        icone: (
          <Icone>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </Icone>
        ),
      },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/suplementos/admin') return pathname === '/suplementos/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Conteudo do item. Fica num filho do `Link` de proposito: e a unica posicao
 * de onde `useLinkStatus` enxerga a navegacao em curso.
 *
 * Sem isso o clique nao tem resposta nenhuma ate a tela inteira trocar — que
 * e o pior momento do admin, medido em ~450 ms nas telas do nucleo e ~1.350 ms
 * nas abas de satelite.
 */
function ConteudoItem({ item }: { item: Item }) {
  const { pending } = useLinkStatus()
  return (
    <span
      className={`admin-nav-conteudo ${pending ? 'admin-nav-conteudo--pendente' : ''}`.trim()}
    >
      {item.icone}
      <span>{item.label}</span>
    </span>
  )
}

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="admin-nav">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="admin-nav-grupo">
          <p className="admin-nav-secao">{grupo.titulo}</p>
          <ul className="admin-nav-lista">
            {grupo.itens.map((item) => {
              const ativo = isActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={ativo ? 'page' : undefined}
                    className={`admin-nav-item ${ativo ? 'admin-nav-item--ativo' : ''}`.trim()}
                  >
                    <ConteudoItem item={item} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
