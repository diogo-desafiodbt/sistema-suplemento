'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FloatingCTA from '@/components/FloatingCTA'
import AddedToCartDialog from '@/components/AddedToCartDialog'
import { getSupplementBySlug, supplements } from '@/lib/supplements-content'
import { useCart } from '@/lib/use-cart'

type Product = {
  id: string
  name: string
  price_monthly: number
  price_quarterly: number
  price_yearly: number
  is_fixed: boolean
  is_active: boolean
}

type PlanType = '1mes' | '3meses' | '1ano'

const PLAN_LABELS: Record<PlanType, string> = {
  '1mes': '1 mês',
  '3meses': '3 meses',
  '1ano': '1 ano',
}

const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  '1mes': 'Compra única',
  '3meses': 'Assinatura',
  '1ano': 'Assinatura',
}

const PLAN_BADGE: Record<PlanType, string> = {
  '1mes': '',
  '3meses': 'Recomendado',
  '1ano': 'Melhor valor',
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

function getPlanPrice(product: Product, plan: PlanType) {
  if (plan === '1mes') return product.price_monthly
  if (plan === '3meses') return product.price_quarterly
  return product.price_yearly
}

function getSavings(product: Product, plan: PlanType) {
  if (plan === '1mes') return 0
  const months = plan === '3meses' ? 3 : 12
  const full = product.price_monthly * months
  const actual = getPlanPrice(product, plan)
  return Math.max(0, full - actual)
}

export default function SupplementPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const content = getSupplementBySlug(slug)
  const { addItem } = useCart()
  const router = useRouter()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<PlanType>('3meses')
  const [openSection, setOpenSection] = useState<string | null>('descricao')
  const [showCartDialog, setShowCartDialog] = useState(false)

  useEffect(() => {
    if (!content) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/products')
        if (!res.ok || !content) return
        const data = await res.json()
        const products: Product[] = data.products ?? []
        const matched = matchProduct(products, content.name) ?? null
        if (!cancelled) setProduct(matched)
      } catch {
        if (!cancelled) setProduct(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [content])

  if (!content) {
    notFound()
  }

  const handleAddToCart = () => {
    if (!product || !content) return
    addItem({
      product_id: product.id,
      name: product.name,
      price_monthly: product.price_monthly,
      plan,
    })
    setShowCartDialog(true)
  }

  const toggleSection = (id: string) => {
    setOpenSection((current) => (current === id ? null : id))
  }

  const related = supplements.filter((s) => s.slug !== content.slug)

  const accordionItems = [
    {
      id: 'descricao',
      title: 'Descrição',
      body: <p className="text-sm text-gray-600 leading-relaxed">{content.description}</p>,
    },
    ...(content.composition.length > 0
      ? [
          {
            id: 'composicao',
            title: 'Composição',
            body: (
              <ul className="divide-y divide-[#ececec] border border-[#ececec] rounded-xl overflow-hidden">
                {content.composition.map((row) => (
                  <li
                    key={row.ativo}
                    className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
                  >
                    <span className="text-[#13244f] font-medium">{row.ativo}</span>
                    <span className="text-gray-500 whitespace-nowrap">{row.dose}</span>
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    {
      id: 'modo-de-uso',
      title: 'Modo de uso',
      body: <p className="text-sm text-gray-600 leading-relaxed">{content.usage}</p>,
    },
  ]

  return (
    <>
      <Header />

      <main className="bg-white">
        <section className="px-4 md:px-6 py-8 md:py-12">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8 md:gap-12 items-start">
            {/* Galeria */}
            <div className="flex flex-col gap-4">
              {content.gallery.map((src, index) => (
                <div
                  key={src}
                  className="relative w-full rounded-2xl overflow-hidden aspect-square bg-[#f5f5f0]"
                >
                  <Image
                    src={src}
                    alt={`${content.name} — imagem ${index + 1}`}
                    fill
                    priority={index === 0}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>

            {/* Detalhes sticky */}
            <div className="md:sticky md:top-24 md:self-start flex flex-col gap-5">
              <div>
                <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-2">
                  {content.name}
                </p>
                <h1 className="font-display text-3xl md:text-4xl text-[#13244f] leading-tight">
                  {content.name}
                </h1>
                <p className="mt-2 text-lg text-gray-600">{content.headline}</p>
                <p className="mt-4 text-gray-600 text-sm md:text-base leading-relaxed">
                  {content.description}
                </p>
              </div>

              <div className="border-t border-[#ececec] pt-5 flex flex-col gap-4">
                {loading ? (
                  <p className="text-sm text-gray-500">Carregando preço…</p>
                ) : product ? (
                  <p className="text-lg font-semibold text-[#13244f]">
                    {plan === '1mes'
                      ? `R$ ${formatPrice(product.price_monthly)}/mês`
                      : `R$ ${formatPrice(getPlanPrice(product, plan))} no plano de ${PLAN_LABELS[plan]}`}
                    {plan !== '1mes' && (
                      <span className="block text-sm font-normal text-gray-500 mt-0.5">
                        estimativa a partir de R$ {formatPrice(product.price_monthly)}/mês
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-[#13244f]">Em breve</p>
                )}

                <div>
                  <h2 className="font-bold text-[#13244f] mb-3 text-sm">Escolha a frequência</h2>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {(['1mes', '3meses', '1ano'] as PlanType[]).map((p) => {
                      const isSelected = plan === p
                      const savings = product ? getSavings(product, p) : 0
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPlan(p)}
                          className={`relative rounded-2xl border p-2.5 sm:p-3 text-center transition-all ${
                            isSelected
                              ? 'border-[#13244f] bg-[#13244f] text-white shadow-md'
                              : 'border-gray-200 bg-white text-[#13244f] hover:border-[#13244f]/40'
                          }`}
                        >
                          {PLAN_BADGE[p] && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f4001e] text-white">
                              {p === '3meses' ? '⭐ Recomendado' : '💰 Melhor valor'}
                            </span>
                          )}
                          <div className={`text-[10px] sm:text-xs font-medium mb-0.5 mt-1 ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                            {PLAN_TYPE_LABEL[p]}
                          </div>
                          <div className="text-xs sm:text-sm font-bold">{PLAN_LABELS[p]}</div>
                          {savings > 0 && (
                            <div className={`text-[10px] sm:text-xs mt-1 font-medium ${isSelected ? 'text-green-300' : 'text-green-600'}`}>
                              Economize R$ {formatPrice(savings)}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    {plan === '1mes'
                      ? 'Compra única, sem renovação automática'
                      : 'Assinatura com renovação automática · Cancele quando quiser'}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  {product ? (
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="inline-flex justify-center items-center bg-[#f4001e] hover:bg-[#a30000] text-white rounded-md px-5 py-3 font-semibold text-sm transition"
                    >
                      Adicionar ao carrinho
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex justify-center items-center bg-[#ececec] text-gray-500 rounded-md px-5 py-3 font-semibold text-sm cursor-not-allowed"
                    >
                      Em breve disponível
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                    </svg>
                    Farmácia credenciada ANVISA
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    Pagamento seguro
                  </span>
                  <span>·</span>
                  <span>Cancele quando quiser</span>
                </div>
              </div>

              {/* Acordeão */}
              <div className="border-t border-[#ececec] divide-y divide-[#ececec]">
                {accordionItems.map((item) => {
                  const open = openSection === item.id
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggleSection(item.id)}
                        className="w-full flex items-center justify-between gap-4 py-4 text-left"
                        aria-expanded={open}
                      >
                        <span className="font-semibold text-[#13244f] text-sm">{item.title}</span>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          className={`flex-shrink-0 text-[#13244f] transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                          aria-hidden
                        >
                          <path d="M5 8.5L12 15.5L19 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          open ? 'max-h-96 opacity-100 pb-4' : 'max-h-0 opacity-0'
                        }`}
                      >
                        {item.body}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Você também pode gostar */}
        <section className="px-4 md:px-6 pb-14 md:pb-20 border-t border-[#ececec]">
          <div className="max-w-6xl mx-auto pt-10 md:pt-14">
            <h2 className="font-display text-2xl md:text-3xl text-[#13244f] mb-6 md:mb-8">
              Você também pode gostar
            </h2>
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={`/suplementos/${item.slug}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-[#f5f5f0]">
                    <Image
                      src={item.gallery[0]}
                      alt={item.name}
                      fill
                      sizes="(max-width: 768px) 33vw, 20vw"
                      className="object-cover transition group-hover:scale-105"
                    />
                  </div>
                  <span className="text-sm font-semibold text-[#13244f] text-center group-hover:text-[#f4001e] transition">
                    {item.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <FloatingCTA />
      <AddedToCartDialog
        open={showCartDialog}
        onOpenChange={setShowCartDialog}
        productName={content.name}
        onFinish={() => router.push('/quiz')}
        onContinue={() => {
          setShowCartDialog(false)
          router.push('/suplementos')
        }}
      />
    </>
  )
}
