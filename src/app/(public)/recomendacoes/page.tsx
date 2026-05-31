'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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
  '3meses': 'Tempo ideal para começar a ver resultados',
  '1ano': 'Maior economia',
}

export default function RecomendacoesPage() {
  const router = useRouter()
  const [items, setItems] = useState<LocalProtocolItem[]>([])
  const [plan, setPlan] = useState<PlanType>('3meses')
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
          }
        })
        setItems(enriched)
      } else {
        setItems(parsedItems)
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
    if (plan === '1mes') return item.price_monthly ?? 0
    if (plan === '3meses') return item.price_quarterly ?? 0
    return item.price_yearly ?? 0
  }

  function getActiveItems(): LocalProtocolItem[] {
    return items.filter(item => !item.removed)
  }

  function getTotalPrice(): number {
    return getActiveItems().reduce((sum, item) => sum + getPrice(item), 0)
  }

  function getSavingsInReais(targetPlan: PlanType): number {
    const monthlyTotal = items
      .filter(item => !item.removed)
      .reduce((sum, item) => sum + (item.price_monthly ?? 0), 0)

    const targetTotal = items
      .filter(item => !item.removed)
      .reduce((sum, item) => {
        if (targetPlan === '3meses') return sum + (item.price_quarterly ?? 0)
        if (targetPlan === '1ano') return sum + (item.price_yearly ?? 0)
        return sum + (item.price_monthly ?? 0)
      }, 0)

    return Math.max(0, monthlyTotal - targetTotal)
  }

  function handleContinue() {
    sessionStorage.setItem('protocol_items', JSON.stringify(items))
    sessionStorage.setItem('selected_plan', plan)
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

  return (
    <div className="min-h-screen bg-[#f5f0eb]">

      {/* Header */}
      <header className="bg-[#f5f0eb] px-6 pt-5 pb-4">
        <div className="max-w-2xl mx-auto">
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

      <main className="max-w-2xl mx-auto px-6 pb-12 pt-6 space-y-6">

        {/* Título */}
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">SEU PROTOCOLO</p>
          <h1 className="text-2xl font-bold text-[#13244f]">Protocolo personalizado</h1>
          <p className="text-gray-500 text-sm mt-1">
            Baseado nas suas respostas, preparamos o tratamento ideal para você.
          </p>
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
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-[#13244f]">{item.product_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.is_required
                          ? 'bg-[#13244f]/10 text-[#13244f]'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {item.is_required ? 'Tratamento principal' : 'Complementar'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.activation_reason}</p>
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
          <h2 className="font-bold text-[#13244f] mb-3">Escolha a frequência</h2>
          <div className="grid grid-cols-3 gap-3">
            {(['1mes', '3meses', '1ano'] as PlanType[]).map(p => {
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
                  {/* Badge */}
                  {PLAN_BADGE[p] && (
                    <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-[#f4001e] text-white' : 'bg-[#f4001e] text-white'
                    }`}>
                      {p === '3meses' ? '⭐ Recomendado' : '💰 Melhor valor'}
                    </span>
                  )}

                  <div className={`text-xs font-medium mb-0.5 mt-1 ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                    {PLAN_TYPE_LABEL[p]}
                  </div>
                  <div className="text-sm font-bold">{PLAN_LABELS[p]}</div>
                  {savings > 0 && (
                    <div className={`text-xs mt-1 font-medium ${isSelected ? 'text-green-300' : 'text-green-600'}`}>
                      Economize R$ {savings.toFixed(2).replace('.', ',')}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Nota informativa sobre assinatura */}
          {plan !== '1mes' && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              Assinatura com renovação automática · Cancele quando quiser
            </p>
          )}
          {plan === '1mes' && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              Compra única, sem renovação automática
            </p>
          )}
        </div>

        {/* Resumo + CTA */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
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

          {/* Microcopy de confiança */}
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

      </main>
    </div>
  )
}
