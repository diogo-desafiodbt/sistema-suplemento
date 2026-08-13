'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Visão Geral', href: '/suplementos/admin' },
  { label: 'Clientes', href: '/suplementos/admin/clientes' },
  { label: 'Pedidos', href: '/suplementos/admin/pedidos' },
  { label: 'Suporte', href: '/suplementos/admin/suporte' },
  { label: 'Usuários', href: '/suplementos/admin/usuarios' },
  { label: 'Cupons', href: '/suplementos/admin/cupons' },
  { label: 'Config', href: '/suplementos/admin/config' },
  { label: 'Auditoria', href: '/suplementos/admin/auditoria' },
]

export function AdminNav() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === '/suplementos/admin') return pathname === '/suplementos/admin'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            isActive(tab.href)
              ? 'bg-[#13244f] text-white'
              : 'text-[#13244f]/60 hover:bg-[#13244f]/10 hover:text-[#13244f]'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
