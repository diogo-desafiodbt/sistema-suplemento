'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supplements } from '@/lib/supplements-content'
import {
  DEFAULT_PURCHASE_PLAN,
  PLAN_BADGE,
  PLAN_HINT,
  PLAN_LABELS,
  PLAN_TYPE_LABEL,
  PURCHASE_PLAN_TYPES,
  getChargePrice,
  getSubscriptionDiscountAmount,
  isPurchasePlanType,
  type PurchasePlanType,
} from '@/lib/plans'

type LocalProtocolItem = {
  product_id: string
  product_name: string
  pharmacy_sku: string
  is_required: boolean
  activation_reason: string
  quantity: number
  removed?: boolean
  price_monthly?: number
  price_quarterly?: number
  price_yearly?: number
  image?: string
}

function matchSupplementImage(productName: string): string | undefined {
  const needle = productName.toLowerCase()
  const firstWord = needle.split(' ')[0]
  const match =
    supplements.find((s) => s.name.toLowerCase() === needle) ??
    supplements.find((s) => s.name.toLowerCase().includes(firstWord)) ??
    supplements.find((s) => needle.includes(s.name.toLowerCase()))
  return match?.gallery[0]
}

function formatProductList(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} e ${names[1]}`
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

export default function RecomendacoesPage() {
  const router = useRouter()
  const [items, setItems] = useState<LocalProtocolItem[]>([])
  const [plan, setPlan] = useState<PurchasePlanType>(DEFAULT_PURCHASE_PLAN)
  const [planLocked, setPlanLocked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFromSessionAndEnrichWithPrices()
  }, [])

  async function loadFromSessionAndEnrichWithPrices() {
    try {
      const itemsRaw = sessionStorage.getItem('protocol_items')
      if (!itemsRaw) {
        router.push('/quiz')
        return
      }

      const parsedItems: LocalProtocolItem[] = JSON.parse(itemsRaw)

      const lockedPlan = sessionStorage.getItem('cart_locked_plan')
      if (lockedPlan && isPurchasePlanType(lockedPlan)) {
        setPlan(lockedPlan)
        setPlanLocked(true)
      } else if (lockedPlan === '3meses' || lockedPlan === '1ano') {
        setPlan(DEFAULT_PURCHASE_PLAN)
        setPlanLocked(true)
      }

      const res = await fetch('/api/products')
      if (res.ok) {
        const { products } = await res.json()
        const enriched = parsedItems.map(item => {
          const product = products.find((p: { name: string }) =>
            p.name.toLowerCase() === item.product_name.toLowerCase()
          ) ?? products.find((p: { name: string }) =>
            p.name.toLowerCase().includes(item.product_name.toLowerCase().split(' ')[0])
          )
          return {
            ...item,
            price_monthly: product?.price_monthly ?? 0,
            price_quarterly: product?.price_quarterly ?? 0,
            price_yearly: product?.price_yearly ?? 0,
            image: matchSupplementImage(item.product_name) ?? item.image,
          }
        })
        setItems(enriched)
      } else {
        setItems(
          parsedItems.map((item) => ({
            ...item,
            image: matchSupplementImage(item.product_name) ?? item.image,
          }))
        )
      }
    } catch {
      router.push('/quiz')
    } finally {
      setLoading(false)
    }
  }

  function toggleItem(productId: string) {
    setItems(prev =>
      prev.map(item =>
        item.product_id === productId && !item.is_required
          ? { ...item, removed: !item.removed }
          : item
      )
    )
  }

  function getPrice(item: LocalProtocolItem): number {
    return getChargePrice(item.price_monthly ?? 0, plan)
  }

  function getActiveItems(): LocalProtocolItem[] {
    return items.filter(item => !item.removed)
  }

  function getTotalPrice(): number {
    return getActiveItems().reduce((sum, item) => sum + getPrice(item), 0)
  }

  function getSavingsInReais(targetPlan: PurchasePlanType): number {
    if (targetPlan === '1mes') return 0
    return getActiveItems().reduce(
      (sum, item) => sum + getSubscriptionDiscountAmount(item.price_monthly ?? 0),
      0
    )
  }

  function handleContinue() {
    sessionStorage.setItem('protocol_items', JSON.stringify(items))
    sessionStorage.setItem('selected_plan', plan)
    sessionStorage.setItem('checkout_source', 'full_quiz')
    router.push('/checkout')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <p className="text-[#13244f]/60 font-medium">Carregando seu protocolo...</p>
      </div>
    )
  }

  if (items.length === 0) return null

  const activeItems = getActiveItems()
  const approvedNames = formatProductList(activeItems.map((i) => i.product_name))

  return (
    <div className="min-h-screen bg-[#f5f0eb]">

      {/* Header */}
      <header className="bg-[#f5f0eb] px-6 pt-5 pb-4">
        <div className="max-w-2xl lg:max-w-5xl mx-auto">
          <img src="/logo-azul.png" alt="Desafio Diabetes" className="h-7 w-auto mb-5" />

          {/* Progressão */}
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-[#13244f]">
              <span className="w-4 h-4 rounded-full bg-[#13244f] text-white flex items-center justify-center text-[10px]">✓</span>
              Protocolo
            </span>
            <span className="flex-1 h-px bg-[#13244f]/20" />
            <span className="flex items-center gap-1.5 text-[#13244f] font-semibold">
              <span className="w-4 h-4 rounded-full bg-[#13244f] text-white flex items-center justify-center text-[10px]">2</span>
              Checkout
            </span>
            <span className="flex-1 h-px bg-[#13244f]/20" />
            <span className="flex items-center gap-1.5 text-[#13244f]/40">
              <span className="w-4 h-4 rounded-full border border-[#13244f]/30 flex items-center justify-center text-[10px]">3</span>
              Prescrição
            </span>
            <span className="flex-1 h-px bg-[#13244f]/20" />
            <span className="flex items-center gap-1.5 text-[#13244f]/40">
              <span className="w-4 h-4 rounded-full border border-[#13244f]/30 flex items-center justify-center text-[10px]">4</span>
              Entrega
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl lg:max-w-5xl mx-auto px-6 pb-12 pt-6">
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">
          <div className="space-y-6">
            {/* Título */}
            <div>
              {planLocked ? (
                <>
                  <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-1">SEU PEDIDO</p>
                  <h1 className="font-display text-2xl md:text-3xl text-[#13244f]">Pronto para finalizar</h1>
                  <p className="text-gray-500 text-sm md:text-base mt-1">
                    Confira os itens e escolha o plano para <strong className="text-[#13244f] font-semibold">{approvedNames}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-1">SEU PROTOCOLO</p>
                  <h1 className="font-display text-2xl md:text-3xl text-[#13244f]">Protocolo personalizado</h1>
                  <p className="text-gray-500 text-sm md:text-base mt-1">
                    Baseado nas suas respostas, preparamos o tratamento ideal para você.
                  </p>
                </>
              )}
            </div>

            {/* Itens do protocolo */}
            <div className="space-y-3">
              {items.map(item => {
                const isRemoved = item.removed
                const price = getPrice(item)

                return (
                  <div
                    key={item.product_id}
                    className={`bg-white rounded-2xl border border-gray-100 p-4 transition-opacity shadow-sm ${
                      isRemoved ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.product_name}
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-[#ececec] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-[#13244f] md:text-base">{item.product_name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              item.is_required
                                ? 'bg-[#13244f]/10 text-[#13244f]'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {item.is_required ? 'Tratamento principal' : 'Complementar'}
                            </span>
                          </div>
                          <p className="text-sm md:text-base text-gray-500 leading-relaxed">{item.activation_reason}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-[#13244f]">R$ {price.toFixed(2).replace('.', ',')}</p>
                        {!item.is_required && (
                          <button
                            onClick={() => toggleItem(item.product_id)}
                            className="text-xs text-gray-400 hover:text-gray-600 mt-1 underline"
                          >
                            {isRemoved ? 'Adicionar' : 'Remover'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Seleção de plano */}
            <div>
              <h2 className="font-bold text-[#13244f] mb-3">Escolha a forma de compra</h2>
              {planLocked ? (
                <div className="rounded-2xl border border-[#13244f]/20 bg-[#13244f]/5 px-4 py-3 text-sm md:text-base text-[#13244f] font-medium text-center">
                  Plano escolhido: {PLAN_LABELS[plan]}
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-3">
                {PURCHASE_PLAN_TYPES.map(p => {
                  const savings = getSavingsInReais(p)
                  const isSelected = plan === p

                  return (
                    <button
                      key={p}
                      onClick={() => setPlan(p)}
                      className={`relative rounded-2xl border p-3 text-center transition-all ${
                        isSelected
                          ? 'border-[#13244f] bg-[#13244f] text-white shadow-md'
                          : 'border-gray-200 bg-white text-[#13244f] hover:border-[#13244f]/40'
                      }`}
                    >
                      {PLAN_BADGE[p] && (
                        <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSelected ? 'bg-[#f4001e] text-white' : 'bg-[#f4001e] text-white'
                        }`}>
                          {PLAN_BADGE[p]}
                        </span>
                      )}

                      <div className={`text-xs font-medium mb-0.5 mt-1 ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                        {PLAN_TYPE_LABEL[p]}
                      </div>
                      <div className="text-sm font-bold">{PLAN_LABELS[p]}</div>
                      {savings > 0 && (
                        <div className={`text-xs mt-1 font-medium ${isSelected ? 'text-green-300' : 'text-green-600'}`}>
                          Economize R$ {savings.toFixed(2).replace('.', ',')}/mês
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              )}

              <p className="text-xs text-gray-400 mt-2 text-center">
                {PLAN_HINT[plan]}
              </p>
            </div>

            {/* Resumo + CTA */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm md:text-base text-gray-500">
                  {activeItems.length} {activeItems.length === 1 ? 'produto' : 'produtos'}
                </span>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#13244f]">
                    R$ {getTotalPrice().toFixed(2).replace('.', ',')}
                  </p>
                  <p className="text-xs text-gray-400">por {PLAN_LABELS[plan]}</p>
                </div>
              </div>

              <button
                onClick={handleContinue}
                disabled={activeItems.length === 0}
                className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-4 rounded-full font-bold text-sm transition active:scale-95 disabled:opacity-40"
              >
                Garantir meu protocolo
              </button>

              <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Pagamento seguro
                </span>
                <span>·</span>
                <span>Farmácia credenciada ANVISA</span>
                <span>·</span>
                <span>Cancele quando quiser</span>
              </div>
            </div>
          </div>

          {/* Coluna lateral desktop */}
          <aside className="hidden lg:block lg:sticky lg:top-8">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase">Confiança</p>
              <h2 className="font-display text-xl text-[#13244f] leading-snug">
                {planLocked ? 'Compra liberada' : 'Protocolo sob medida'}
              </h2>
              <ul className="space-y-2 text-sm md:text-base text-gray-600">
                <li>Farmácia credenciada ANVISA</li>
                <li>Pagamento seguro</li>
                <li>Cancele quando quiser</li>
                <li>Frete grátis</li>
              </ul>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400">Plano</p>
                <p className="text-sm md:text-base font-semibold text-[#13244f]">{PLAN_LABELS[plan]}</p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
