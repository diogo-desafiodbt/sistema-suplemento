'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Pendentes', href: '/profissional/fila' },
  { label: 'Assinados', href: '/profissional/assinados' },
]

export function ProfessionalNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1">
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname.startsWith(tab.href)
              ? 'bg-white text-[#13244f]'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
