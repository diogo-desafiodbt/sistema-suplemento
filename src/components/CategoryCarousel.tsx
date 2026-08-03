'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AddedToCartDialog from '@/components/AddedToCartDialog'
import { supplements } from '@/lib/supplements-content'
import { useCart } from '@/lib/use-cart'
import { DEFAULT_PURCHASE_PLAN, getChargePrice } from '@/lib/plans'

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
  const router = useRouter()
  const { addItem } = useCart()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showCartDialog, setShowCartDialog] = useState(false)
  const [dialogItem, setDialogItem] = useState<{
    name: string
    image: string
    price_monthly: number
  } | null>(null)

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

  function handleAddToCart(supplement: (typeof supplements)[number], product: Product) {
    addItem({
      product_id: product.id,
      name: product.name,
      price_monthly: product.price_monthly,
      plan: DEFAULT_PURCHASE_PLAN,
      image: supplement.gallery[0],
    })
    setDialogItem({
      name: supplement.name,
      image: supplement.gallery[0],
      price_monthly: product.price_monthly,
    })
    setShowCartDialog(true)
  }

  return (
    <div className="w-full">
      <h2 className="font-display text-2xl md:text-3xl text-[#13244f] mb-6 md:mb-8">
        Escolha seu suplemento
      </h2>

      <div className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory scroll-pl-4 md:scroll-pl-2 pb-1 -mx-4 px-4 md:mx-0 md:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {supplements.map((supplement) => {
          const product = matchProduct(products, supplement.name)
          const image = supplement.gallery[0]

          return (
            <div
              key={supplement.slug}
              className="flex-shrink-0 snap-start w-[73vw] sm:w-[320px] md:w-[400px] flex flex-col"
            >
              <Link
                href={`/suplementos/${supplement.slug}`}
                className="relative rounded-2xl overflow-hidden aspect-square group"
              >
                <Image
                  src={image}
                  alt={supplement.name}
                  fill
                  sizes="(max-width: 640px) 73vw, (max-width: 768px) 320px, 400px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <span className="absolute bottom-6 left-0 right-0 text-center text-white font-display text-xl md:text-2xl">
                  {supplement.name}
                </span>
                <span
                  className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-white flex items-center justify-center"
                  aria-hidden
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8h10M9 4l4 4-4 4"
                      stroke="#13244f"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>

              <div className="pt-3 flex flex-col gap-3">
                {loading ? (
                  <p className="text-sm text-gray-500">Carregando preço…</p>
                ) : product ? (
                  <p className="text-lg font-semibold text-[#13244f]">
                    {`R$ ${formatPrice(getChargePrice(product.price_monthly, 'assinatura_mensal'))}/mês`}
                    <span className="block text-sm font-normal text-gray-500 mt-0.5">
                      de R$ {formatPrice(product.price_monthly)}/mês · 10% off
                    </span>
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-[#13244f]">Em breve</p>
                )}

                <div className="flex gap-2">
                  <Link
                    href={`/suplementos/${supplement.slug}`}
                    className="flex-1 inline-flex justify-center items-center rounded-md px-3 py-2.5 font-semibold text-sm transition border border-[#13244f] text-[#13244f] bg-transparent hover:bg-[#13244f]/5"
                  >
                    Detalhes
                  </Link>
                  <button
                    type="button"
                    disabled={!product}
                    onClick={() => product && handleAddToCart(supplement, product)}
                    className="flex-1 inline-flex justify-center items-center bg-[#f4001e] hover:bg-[#a30000] text-white rounded-md px-3 py-2.5 font-semibold text-sm transition disabled:bg-[#ececec] disabled:text-gray-500 disabled:hover:bg-[#ececec] disabled:cursor-not-allowed"
                  >
                    Adicionar ao carrinho
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <AddedToCartDialog
        open={showCartDialog}
        onOpenChange={setShowCartDialog}
        productName={dialogItem?.name ?? ''}
        productImage={dialogItem?.image ?? ''}
        productPrice={dialogItem?.price_monthly}
        onFinish={() => router.push('/quiz')}
        onContinue={() => setShowCartDialog(false)}
      />
    </div>
  )
}
