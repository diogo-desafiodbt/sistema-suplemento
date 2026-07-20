'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { QUIZ_URL } from '@/lib/constants'

export default function FloatingCTA() {
  const [floatVisible, setFloatVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setFloatVisible(window.scrollY > window.innerHeight * 0.5)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-[#13244f] text-white py-3 md:py-4 px-4 md:px-6 z-40 shadow-lg transition-transform duration-300 ${floatVisible ? 'translate-y-0' : 'translate-y-full'}`}
      aria-hidden={!floatVisible}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <p className="text-xs md:text-sm hidden sm:block leading-tight">
          Controle o diabetes com suplementos de baixo índice glicêmico.
        </p>
        <Link
          href={QUIZ_URL}
          className="w-full sm:w-auto bg-white text-[#f4001e] text-center px-5 md:px-6 py-2.5 rounded-full font-bold text-sm hover:bg-gray-100 active:scale-95 transition flex-shrink-0"
        >
          Quero meu protocolo
        </Link>
      </div>
    </div>
  )
}
