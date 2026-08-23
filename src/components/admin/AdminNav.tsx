'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = { label: string; href: string }

const grupos: { titulo: string; itens: Item[] }[] = [
  {
    titulo: 'Operação',
    itens: [
      { label: 'Visão Geral', href: '/suplementos/admin' },
      { label: 'Pedidos', href: '/suplementos/admin/pedidos' },
      { label: 'Suporte', href: '/suplementos/admin/suporte' },
      { label: 'Alertas', href: '/suplementos/admin/alertas' },
    ],
  },
  {
    titulo: 'Clínico',
    itens: [
      { label: 'Clientes', href: '/suplementos/admin/clientes' },
      { label: 'Auditoria', href: '/suplementos/admin/auditoria' },
    ],
  },
  {
    titulo: 'Ajustes',
    itens: [
      { label: 'Cupons', href: '/suplementos/admin/cupons' },
      { label: 'Config', href: '/suplementos/admin/config' },
      { label: 'Usuários', href: '/suplementos/admin/usuarios' },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/suplementos/admin') return pathname === '/suplementos/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="admin-nav flex flex-col gap-6 px-3 py-5">
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="admin-nav-secao px-3 mb-2">{grupo.titulo}</p>
          <ul className="flex flex-col gap-0.5">
            {grupo.itens.map((item) => {
              const ativo = isActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`admin-nav-item ${ativo ? 'admin-nav-item--ativo' : ''}`}
                  >
                    {item.label}
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
