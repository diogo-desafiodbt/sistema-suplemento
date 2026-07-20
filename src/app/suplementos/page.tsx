'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FloatingCTA from '@/components/FloatingCTA'
import BannerCarousel from '@/components/BannerCarousel'
import CategoryCarousel from '@/components/CategoryCarousel'
import { QUIZ_URL } from '@/lib/constants'

type Product = {
  id: string
  name: string
  price_monthly: number
  price_quarterly: number
  price_yearly: number
  is_fixed: boolean
  is_active: boolean
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function CapsuleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="10" y="18" width="28" height="12" rx="6" stroke="#13244f" strokeWidth="2" />
      <path d="M24 18v12" stroke="#13244f" strokeWidth="2" />
      <path d="M14 21c1.5-1.5 4-1.5 5.5 0" stroke="#f4001e" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function SuplementosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/products')
        if (res.ok) {
          const data = await res.json()
          setProducts(data.products ?? [])
        }
      } catch {
        setProducts([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <>
      <Header />

      <section className="bg-white py-8 md:py-12 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <BannerCarousel />
        </div>
      </section>

      <section className="bg-white py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <CategoryCarousel />
        </div>
      </section>

      <section className="bg-[#f5f5f0] py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <p className="text-center text-sm text-gray-500">Carregando suplementos…</p>
          ) : products.length === 0 ? (
            <p className="text-center text-sm text-gray-500">Nenhum suplemento disponível no momento.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col gap-4 shadow-sm"
                >
                  <div className="w-full aspect-square rounded-xl bg-[#ececec] flex items-center justify-center">
                    <CapsuleIcon />
                  </div>

                  <div className="flex flex-col gap-2 flex-1">
                    <span
                      className={`inline-flex self-start text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-md ${
                        product.is_fixed
                          ? 'bg-[#f4001e]/10 text-[#f4001e]'
                          : 'bg-[#13244f]/10 text-[#13244f]'
                      }`}
                    >
                      {product.is_fixed ? 'Tratamento principal' : 'Complementar'}
                    </span>
                    <h2 className="text-lg font-bold text-[#13244f] leading-snug">{product.name}</h2>
                    <p className="text-sm text-gray-600">
                      a partir de R$ {formatPrice(product.price_monthly ?? 0)}/mês
                    </p>
                  </div>

                  <Link
                    href={QUIZ_URL}
                    className="block w-full text-center bg-[#f4001e] hover:bg-[#a30000] text-white rounded-full font-bold text-sm py-3 transition active:scale-95"
                  >
                    Quero esse no meu protocolo
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
      <FloatingCTA />
    </>
  )
}
