'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Meu Protocolo', href: '/dashboard' },
  { label: 'Minha Dieta', href: '/dashboard/dieta' },
  { label: 'Guia Digital', href: '/dashboard/guia' },
  { label: 'Planeje a Semana', href: '/dashboard/semana' },
  { label: 'Minha Assinatura', href: '/dashboard/assinatura' },
  { label: 'Meu Perfil', href: '/dashboard/perfil' },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-gray-200 bg-white px-4 md:px-6">
      {tabs.map(tab => {
        const isActive =
          tab.href === '/dashboard'
            ? pathname === '/dashboard' || pathname === '/dashboard/protocolo'
            : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-[#f4001e] text-[#13244f]'
                : 'border-transparent text-gray-400 hover:text-[#13244f]'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
