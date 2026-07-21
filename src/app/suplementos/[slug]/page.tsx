'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
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

const testimonials = [
  {
    title: 'Da glicada 11,6 para 5,1 — praticamente eliminei os remédios!',
    text: 'Descobri o diabetes com glicose de 287. Segui a dieta à risca e em fevereiro de 2026 minha glicada foi 5,17 e glicose de jejum 102. Era pra tomar 4 glifage, 2 glicazidas e 9 pontos de insulina — hoje tomo apenas 2 glifage.',
    name: 'Alexandre, 47 anos',
    plan: 'Comunidade Desafio Diabetes',
  },
  {
    title: 'Glicada de 7,2% para 5,0% — controle perfeito!',
    text: 'Fui diagnosticada pré-diabética em 2024. Em outubro de 2025 estava em 7,2%. Depois que iniciei a dieta, em maio de 2026: glicada 5,0% e açúcar médio de 97 mg/dL. Perdi 17 kg. A vitória é certa!',
    name: 'Giselle, 43 anos',
    plan: 'Comunidade Desafio Diabetes',
  },
]

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
  const [allProducts, setAllProducts] = useState<Product[]>([])
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
        if (!cancelled) {
          setAllProducts(products)
          setProduct(matched)
        }
      } catch {
        if (!cancelled) {
          setAllProducts([])
          setProduct(null)
        }
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

  const related = supplements.filter((s) => s.slug !== content.slug)

  const relatedWithProducts = related
    .map((s) => ({ content: s, product: matchProduct(allProducts, s.name) }))
    .filter((r): r is { content: (typeof related)[number]; product: Product } => !!r.product)

  const bundleMonthly =
    (product?.price_monthly ?? 0) +
    relatedWithProducts.reduce((sum, r) => sum + r.product.price_monthly, 0)

  const handleAddToCart = () => {
    if (!product || !content) return
    addItem({
      product_id: product.id,
      name: product.name,
      price_monthly: product.price_monthly,
      plan,
      image: content.gallery[0],
    })
    setShowCartDialog(true)
  }

  const handleAddAllToCart = () => {
    if (!product || !content) return
    addItem({
      product_id: product.id,
      name: product.name,
      price_monthly: product.price_monthly,
      plan,
      image: content.gallery[0],
    })
    for (const r of relatedWithProducts) {
      addItem({
        product_id: r.product.id,
        name: r.product.name,
        price_monthly: r.product.price_monthly,
        plan,
        image: r.content.gallery[0],
      })
    }
    setShowCartDialog(true)
  }

  const toggleSection = (id: string) => {
    setOpenSection((current) => (current === id ? null : id))
  }

  const primary = content.composition[0]

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
              <div>
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
                {content.scienceNote && (
                  <p className="text-xs text-gray-500 italic pt-3 border-t border-gray-100 mt-3">
                    {content.scienceNote}
                  </p>
                )}
              </div>
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
                {primary && (
                  <p className="mt-4 text-sm md:text-base text-[#13244f] font-medium leading-relaxed">
                    Ativo principal: {primary.ativo} — {primary.dose}
                  </p>
                )}
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

                <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-gray-500">
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                    </svg>
                    <span>Farmácia credenciada ANVISA</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span>Pagamento seguro</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Cancele quando quiser</span>
                  </div>
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
                          open ? 'max-h-[32rem] opacity-100 pb-4' : 'max-h-0 opacity-0'
                        }`}
                      >
                        {item.body}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reviews */}
              <div className="border-t border-[#ececec] pt-6">
                <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-3">
                  RESULTADOS DA COMUNIDADE
                </p>
                <div className="grid grid-cols-1 gap-4">
                  {testimonials.map((t, i) => (
                    <div
                      key={i}
                      className="bg-white rounded-2xl p-5 flex flex-col gap-3 shadow-sm border border-gray-100"
                    >
                      <svg width="32" height="24" viewBox="0 0 32 24" fill="none" className="flex-shrink-0 opacity-20" aria-hidden>
                        <path d="M0 24V14.4C0 6.4 4.8 1.6 14.4 0L16 3.2C11.2 4.267 8.533 7.2 8 12H14.4V24H0ZM17.6 24V14.4C17.6 6.4 22.4 1.6 32 0L33.6 3.2C28.8 4.267 26.133 7.2 25.6 12H32V24H17.6Z" fill="#13244f"/>
                      </svg>
                      <p className="font-bold text-[#13244f] text-sm leading-snug">
                        &ldquo;{t.title}&rdquo;
                      </p>
                      <p className="text-sm text-gray-600 leading-relaxed flex-1">{t.text}</p>
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div>
                          <p className="text-sm font-bold text-[#13244f]">{t.name}</p>
                          <p className="text-xs text-gray-400">{t.plan}</p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full">
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                            <circle cx="7" cy="7" r="7" fill="#22c55e"/>
                            <path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          <span className="text-xs text-green-700 font-medium">Verificado</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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

            {product && relatedWithProducts.length > 0 && (
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-[#ececec] bg-[#f5f5f0] px-5 py-4">
                <p className="text-sm text-[#13244f] font-medium text-center sm:text-left">
                  Leve todos juntos a partir de{' '}
                  <span className="font-bold">R$ {formatPrice(bundleMonthly)}/mês</span>
                </p>
                <button
                  type="button"
                  onClick={handleAddAllToCart}
                  className="inline-flex justify-center bg-[#f4001e] hover:bg-[#a30000] text-white rounded-full px-6 py-3 font-semibold text-sm transition whitespace-nowrap"
                >
                  Adicionar todos ao carrinho
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
      <AddedToCartDialog
        open={showCartDialog}
        onOpenChange={setShowCartDialog}
        productName={content.name}
        productImage={content.gallery[0]}
        productPrice={product?.price_monthly}
        onFinish={() => router.push('/quiz')}
        onContinue={() => {
          setShowCartDialog(false)
          router.push('/suplementos')
        }}
      />
    </>
  )
}
