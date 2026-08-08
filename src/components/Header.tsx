'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import PromoBar from '@/components/PromoBar'

const menuItems = [
  { label: 'Suplementos', href: '/suplementos' },
  { label: 'Termos de Uso', href: '/termos-de-uso' },
  { label: 'Entrar', href: '/login' },
] as const

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
          <Link
            href="/suplementos"
            className="relative z-10 shrink-0"
            onClick={() => setMenuOpen(false)}
          >
            <Image
              src="/logo-principal.png"
              alt="Desafio Diabetes"
              width={600}
              height={196}
              className="h-12 sm:h-14 w-auto"
            />
          </Link>

          <div
            className="relative z-10 flex items-center gap-2 sm:gap-3"
            ref={menuRef}
          >
            <a
              href="/quiz"
              className="hidden sm:inline-flex items-center justify-center min-h-11 px-5 py-2.5 rounded-full bg-[#f4001e] text-white text-sm font-bold hover:bg-[#a30000] transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#13244f]"
            >
              Começar avaliação
            </a>
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
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M15 5L5 15M5 5l10 10"
                    stroke="#13244f"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 22 22"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 6h16M3 11h16M3 16h16"
                    stroke="#13244f"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>

            {menuOpen && (
              <div
                id="header-menu"
                role="menu"
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-[#ececec] divide-y divide-[#ececec] overflow-hidden"
              >
                <a
                  href="/quiz"
                  role="menuitem"
                  className="block px-4 py-3 text-sm font-bold text-[#f4001e] hover:bg-[#ececec] transition sm:hidden"
                  onClick={() => setMenuOpen(false)}
                >
                  Começar avaliação
                </a>
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
    </>
  )
}
