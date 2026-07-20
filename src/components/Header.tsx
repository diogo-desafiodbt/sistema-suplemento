'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import PromoBar from '@/components/PromoBar'
import CartDrawer from '@/components/CartDrawer'
import { QUIZ_URL } from '@/lib/constants'
import { useCart } from '@/lib/use-cart'

const menuItems = [
  { label: 'Suplementos', href: '/suplementos' },
  { label: 'Quem somos', href: '/institucional#quem-somos' },
  { label: 'Entrar', href: '/login' },
] as const

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { items } = useCart()
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0)

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <>
      <PromoBar />

      <header className="relative bg-white border-b border-[#ececec] sticky top-8 z-40">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="/"
            className="relative z-10 shrink-0"
            onClick={() => setMenuOpen(false)}
          >
            <img src="/logo-principal.png" alt="Desafio Diabetes" className="h-12 sm:h-14 w-auto" />
          </a>

          <Link
            href={QUIZ_URL}
            className="absolute left-1/2 hidden -translate-x-1/2 md:inline-flex bg-[#f4001e] hover:bg-[#a30000] text-white rounded-md px-4 py-2.5 sm:px-5 font-semibold text-sm transition"
          >
            Descubra seu suplemento ideal
          </Link>

          <div className="relative z-10 flex items-center gap-1" ref={menuRef}>
            <button
              type="button"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-[#13244f] transition-colors hover:bg-[#ececec]"
              aria-label="Abrir carrinho"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingCart className="h-5 w-5" aria-hidden />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f4001e] px-1 text-[10px] font-bold text-white leading-none">
                  {cartCount}
                </span>
              )}
            </button>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#13244f] transition-colors hover:bg-[#ececec]"
              aria-expanded={menuOpen}
              aria-controls="header-menu"
              aria-haspopup="menu"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M15 5L5 15M5 5l10 10" stroke="#13244f" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
                  <path d="M3 6h16M3 11h16M3 16h16" stroke="#13244f" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </button>

            {menuOpen && (
              <div
                id="header-menu"
                role="menu"
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-[#ececec] divide-y divide-[#ececec] overflow-hidden"
              >
                {menuItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className="block px-4 py-3 text-sm font-semibold text-[#13244f] hover:bg-[#ececec] hover:text-[#f4001e] transition"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  )
}
