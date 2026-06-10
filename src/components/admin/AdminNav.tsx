'use client'

import Link from 'next/link'

type AdminNavProps = {
  active: 'usuarios' | 'pedidos' | 'auditoria' | 'cupons' | 'config'
}

const tabs = [
  { label: 'Usuários', href: '/admin/usuarios', key: 'usuarios' },
  { label: 'Pedidos', href: '/admin/pedidos', key: 'pedidos' },
  { label: 'Auditoria', href: '/admin/auditoria', key: 'auditoria' },
  { label: 'Cupons', href: '/admin/cupons', key: 'cupons' },
  { label: 'Configurações', href: '/admin/config', key: 'config' },
]

export function AdminNav({ active }: AdminNavProps) {
  return (
    <nav className="flex gap-1">
      {tabs.map(tab => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab.key === active
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
