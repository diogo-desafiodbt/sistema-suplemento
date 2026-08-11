'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function DashboardNav() {
  const pathname = usePathname()
  const isActive = pathname.startsWith('/dashboard/pedidos')

  return (
    <div className="border-b border-gray-200 bg-white px-4 md:px-6">
      <Link
        href="/dashboard/pedidos"
        className={`inline-block whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
          isActive
            ? 'border-[#f4001e] text-[#13244f]'
            : 'border-transparent text-gray-400 hover:text-[#13244f]'
        }`}
      >
        Meus Pedidos
      </Link>
    </div>
  )
}
