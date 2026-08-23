'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// `externa` marca a aba que NÃO é deste app. Alertas é servida por outro
// serviço (Lambda, Zona 2) — o roteador do Next não conhece essa rota e uma
// navegação de cliente daria 404. Âncora comum força ida ao servidor, que é o
// ALB decidindo. Toda aba de satélite daqui pra frente entra assim.
const tabs = [
  { label: 'Visão Geral', href: '/suplementos/admin' },
  { label: 'Clientes', href: '/suplementos/admin/clientes' },
  { label: 'Pedidos', href: '/suplementos/admin/pedidos' },
  { label: 'Suporte', href: '/suplementos/admin/suporte' },
  { label: 'Usuários', href: '/suplementos/admin/usuarios' },
  { label: 'Cupons', href: '/suplementos/admin/cupons' },
  { label: 'Config', href: '/suplementos/admin/config' },
  { label: 'Auditoria', href: '/suplementos/admin/auditoria' },
  { label: 'Alertas', href: '/suplementos/admin/alertas', externa: true },
]

export function AdminNav() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === '/suplementos/admin') return pathname === '/suplementos/admin'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const classe = `px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
          isActive(tab.href)
            ? 'bg-[#13244f] text-white'
            : 'text-[#13244f]/60 hover:bg-[#13244f]/10 hover:text-[#13244f]'
        }`

        return tab.externa ? (
          <a key={tab.href} href={tab.href} className={classe}>
            {tab.label}
          </a>
        ) : (
          <Link key={tab.href} href={tab.href} className={classe}>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
