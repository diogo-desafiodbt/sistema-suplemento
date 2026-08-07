'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supplements } from '@/lib/supplements-content'

type Product = {
  id: string
  name: string
  price_monthly: number
  price_quarterly: number
  price_yearly: number
  is_fixed: boolean
  is_active: boolean
}

function matchProduct(products: Product[], name: string): Product | undefined {
  const needle = name.toLowerCase()
  const firstWord = needle.split(' ')[0]
  return (
    products.find((p) => p.name.toLowerCase() === needle) ??
    products.find((p) => p.name.toLowerCase().includes(firstWord)) ??
    products.find((p) => needle.includes(p.name.toLowerCase()))
  )
}

export default function CategoryCarousel() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/products')
        if (!res.ok) return
        const data = await res.json()
        const list: Product[] = data.products ?? []
        if (!cancelled) setProducts(list)
      } catch {
        if (!cancelled) setProducts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function scrollByCard(direction: -1 | 1) {
    const el = scrollerRef.current
    if (!el) return
    const amount = Math.min(el.clientWidth * 0.85, 400)
    el.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  return (
    <div className="w-full">
      <div className="mb-6 md:mb-8 max-w-2xl">
        <h2 className="font-display text-2xl md:text-3xl text-[#13244f]">
          Conheça a linha
        </h2>
        <p className="text-base md:text-lg text-[#13244f]/80 mt-2 leading-relaxed">
          Conteúdo informativo. A indicação do seu protocolo só acontece depois
          do questionário.
        </p>
        <p className="text-base text-[#13244f]/70 mt-2 md:hidden">
          Use as setas ou deslize para o lado →
        </p>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => scrollByCard(-1)}
          aria-label="Ver produtos anteriores"
          className="absolute left-0 top-[28%] z-10 -translate-y-1/2 -translate-x-1 md:-translate-x-3 w-12 h-12 rounded-full bg-white border-2 border-[#13244f] text-[#13244f] shadow-md flex items-center justify-center hover:bg-[#f5f0eb] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#13244f]"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 4L6 8l4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => scrollByCard(1)}
          aria-label="Ver próximos produtos"
          className="absolute right-0 top-[28%] z-10 -translate-y-1/2 translate-x-1 md:translate-x-3 w-12 h-12 rounded-full bg-white border-2 border-[#13244f] text-[#13244f] shadow-md flex items-center justify-center hover:bg-[#f5f0eb] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#13244f]"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div
          ref={scrollerRef}
          className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory scroll-pl-4 md:scroll-pl-2 pb-2 px-1 scroll-smooth"
        >
          {supplements.map((supplement) => {
            const product = matchProduct(products, supplement.name)
            const image = supplement.gallery[0]

            return (
              <div
                key={supplement.slug}
                className="flex-shrink-0 snap-start w-[78vw] sm:w-[300px] md:w-[360px] flex flex-col"
              >
                <Link
                  href={`/suplementos/${supplement.slug}`}
                  className="relative rounded-2xl overflow-hidden aspect-square group focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#13244f]"
                >
                  <Image
                    src={image}
                    alt={supplement.name}
                    fill
                    sizes="(max-width: 640px) 78vw, (max-width: 768px) 300px, 360px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                  <span className="absolute bottom-5 left-3 right-3 text-center text-white font-display text-xl md:text-2xl">
                    {supplement.name}
                  </span>
                </Link>

                <div className="pt-4 flex flex-col gap-3">
                  <p className="text-base text-[#13244f]/85 leading-relaxed line-clamp-2">
                    {supplement.headline}
                  </p>
                  {loading ? (
                    <p className="text-base text-[#13244f]/60">Carregando…</p>
                  ) : !product ? (
                    <p className="text-base font-semibold text-[#13244f]">
                      Em breve
                    </p>
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Link
                      href={`/suplementos/${supplement.slug}`}
                      className="flex-1 inline-flex justify-center items-center min-h-12 rounded-full px-4 py-3 font-semibold text-base transition border-2 border-[#13244f] text-[#13244f] hover:bg-[#13244f]/5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#13244f]"
                    >
                      Saiba mais
                    </Link>
                    <Link
                      href="/quiz"
                      className="flex-1 inline-flex justify-center items-center min-h-12 bg-[#f4001e] hover:bg-[#a30000] text-white rounded-full px-4 py-3 font-semibold text-base transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#13244f]"
                    >
                      Fazer avaliação
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
