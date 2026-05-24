'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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

const PLAN_DISCOUNT: Record<PlanType, string> = {
  '1mes': '',
  '3meses': 'Economize 5%',
  '1ano': 'Economize 15%',
}

export default function RecomendacoesPage() {
  const router = useRouter()
  const [items, setItems] = useState<LocalProtocolItem[]>([])
  const [plan, setPlan] = useState<PlanType>('1mes')
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

  function handleContinue() {
    sessionStorage.setItem('protocol_items', JSON.stringify(items))
    sessionStorage.setItem('selected_plan', plan)
    router.push('/checkout')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Carregando seu protocolo...</p>
      </div>
    )
  }

  if (items.length === 0) return null

  const activeItems = getActiveItems()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <span className="text-sm font-medium">Desafio Diabetes</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Seu protocolo personalizado</h1>
          <p className="text-gray-500 mt-1">
            Baseado nas suas respostas, preparamos o tratamento ideal para você.
          </p>
        </div>

        <div className="space-y-3">
          {items.map(item => {
            const isRemoved = item.removed
            const price = getPrice(item)

            return (
              <div
                key={item.product_id}
                className={`bg-white rounded-lg border p-4 transition-opacity ${
                  isRemoved ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{item.product_name}</span>
                      {item.is_required ? (
                        <Badge variant="secondary" className="text-xs">Tratamento principal</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Complementar</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{item.activation_reason}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold">R$ {price.toFixed(2).replace('.', ',')}</p>
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

        <div>
          <h2 className="font-medium mb-3">Escolha a frequência</h2>
          <div className="grid grid-cols-3 gap-3">
            {(['1mes', '3meses', '1ano'] as PlanType[]).map(p => (
              <button
                key={p}
                onClick={() => setPlan(p)}
                className={`rounded-lg border p-3 text-center transition-colors ${
                  plan === p
                    ? 'border-black bg-black text-white'
                    : 'border-gray-200 hover:border-gray-400 bg-white'
                }`}
              >
                <div className="text-sm font-medium">{PLAN_LABELS[p]}</div>
                {PLAN_DISCOUNT[p] && (
                  <div className={`text-xs mt-0.5 ${plan === p ? 'text-gray-300' : 'text-green-600'}`}>
                    {PLAN_DISCOUNT[p]}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">
              {activeItems.length} {activeItems.length === 1 ? 'produto' : 'produtos'} selecionados
            </span>
            <div className="text-right">
              <p className="text-2xl font-semibold">
                R$ {getTotalPrice().toFixed(2).replace('.', ',')}
              </p>
              <p className="text-xs text-gray-400">por {PLAN_LABELS[plan]}</p>
            </div>
          </div>

          <Button
            onClick={handleContinue}
            disabled={activeItems.length === 0}
            className="w-full"
            size="lg"
          >
            Continuar para o checkout
          </Button>

          <p className="text-xs text-center text-gray-400">
            Entrega discreta direto na sua casa. Renovação automática, cancele quando quiser.
          </p>
        </div>
      </main>
    </div>
  )
}
