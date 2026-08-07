'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  DEFAULT_PURCHASE_PLAN,
  formatBRL,
  getChargePrice,
  getInstallmentPrice,
  getPlanInstallmentCount,
  getSubscriptionDiscountAmount,
  PLAN_BADGE,
  PLAN_HINT,
  PLAN_TYPE_LABEL,
  PURCHASE_PLAN_TYPES,
  type PurchasePlanType,
} from '@/lib/plans'
import { supplements } from '@/lib/supplements-content'

type LocalProtocolItem = {
  product_id: string
  product_name: string
  pharmacy_sku: string
  is_required: boolean
  activation_reason: string
  quantity: number
  removed?: boolean
  blocked?: boolean
  price_monthly?: number
  price_quarterly?: number
  price_yearly?: number
  image?: string
}

const FAQ_ITEMS = [
  {
    id: 'assinatura',
    q: 'Isso é uma assinatura?',
    a: 'Não. Toda compra é única — à vista (1 mês) ou parcelada no cartão (3 ou 6 meses). Não existe cobrança automática depois que o pedido é pago.',
  },
  {
    id: 'avaliacao',
    q: 'Como funciona a avaliação profissional?',
    a: 'Depois da sua triagem, um profissional habilitado do Desafio Diabetes analisa suas respostas e define os suplementos indicados para o seu caso antes de qualquer manipulação.',
  },
  {
    id: 'trocar',
    q: 'Posso trocar os suplementos do meu protocolo?',
    a: 'Você pode remover itens complementares que não quiser levar, mas não é possível adicionar suplementos que não foram indicados na sua avaliação.',
  },
  {
    id: 'cancelar',
    q: 'Posso cancelar minha compra?',
    a: 'Compras à vista ou parceladas em 3x/6x são cobradas integralmente no ato da compra, como qualquer compra parcelada — não há cobrança futura a cancelar.',
  },
  {
    id: 'farmacia',
    q: 'Quem manipula os suplementos?',
    a: 'Farmácias de manipulação credenciadas pela Anvisa, de forma individualizada, conforme a prescrição do seu protocolo.',
  },
] as const

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

/** Marca os 2 mais baratos entre os liberados; demais ficam desmarcados. */
function markTwoCheapest(items: LocalProtocolItem[]): LocalProtocolItem[] {
  const available = items.filter((item) => !item.blocked)
  if (available.length === 0) return items

  const ranked = [...available].sort((a, b) => {
    const priceA = a.price_monthly ?? Number.POSITIVE_INFINITY
    const priceB = b.price_monthly ?? Number.POSITIVE_INFINITY
    return priceA - priceB
  })
  const selectedIds = new Set(
    ranked.slice(0, Math.min(2, ranked.length)).map((item) => item.product_id),
  )

  return items.map((item) => {
    if (item.blocked) return item
    const selected = selectedIds.has(item.product_id)
    return {
      ...item,
      is_required: selected,
      removed: !selected,
      activation_reason: selected
        ? 'Sugestão principal para o seu perfil'
        : 'Disponível — adicione se quiser',
    }
  })
}

export default function RecomendacoesPage() {
  const router = useRouter()
  const [items, setItems] = useState<LocalProtocolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<PurchasePlanType>(
    DEFAULT_PURCHASE_PLAN,
  )
  const [openFaq, setOpenFaq] = useState<string | null>(null)

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
      // Bloqueados não entram na tela (compliance — só o prescrito elegível)
      const visible = parsedItems.filter((item) => !item.blocked)

      const res = await fetch('/api/products')
      if (res.ok) {
        const { products } = await res.json()
        const enriched = visible.map((item) => {
          const product =
            products.find(
              (p: { name: string }) =>
                p.name.toLowerCase() === item.product_name.toLowerCase(),
            ) ??
            products.find((p: { name: string }) =>
              p.name
                .toLowerCase()
                .includes(item.product_name.toLowerCase().split(' ')[0]),
            )
          return {
            ...item,
            price_monthly: product?.price_monthly ?? 0,
            price_quarterly: product?.price_quarterly ?? 0,
            price_yearly: product?.price_yearly ?? 0,
            image: matchSupplementImage(item.product_name) ?? item.image,
          }
        })
        setItems(markTwoCheapest(enriched))
      } else {
        setItems(
          markTwoCheapest(
            visible.map((item) => ({
              ...item,
              image: matchSupplementImage(item.product_name) ?? item.image,
            })),
          ),
        )
      }
    } catch {
      router.push('/quiz')
    } finally {
      setLoading(false)
    }
  }

  function toggleItem(productId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, removed: !item.removed }
          : item,
      ),
    )
  }

  function getPrice(
    item: LocalProtocolItem,
    plan: PurchasePlanType = selectedPlan,
  ): number {
    return getChargePrice(item.price_monthly ?? 0, plan) * (item.quantity ?? 1)
  }

  function getActiveItems(): LocalProtocolItem[] {
    return items.filter((item) => !item.removed)
  }

  function getTotalForPlan(plan: PurchasePlanType): number {
    return getActiveItems().reduce((sum, item) => sum + getPrice(item, plan), 0)
  }

  function getTotalPrice(): number {
    return getTotalForPlan(selectedPlan)
  }

  function getTotalSavings(): number {
    return getActiveItems().reduce((sum, item) => {
      const qty = item.quantity ?? 1
      return (
        sum +
        getSubscriptionDiscountAmount(item.price_monthly ?? 0, selectedPlan) *
          qty
      )
    }, 0)
  }

  function handleContinue() {
    const active = items.filter((item) => !item.removed)
    const ranked = [...active].sort((a, b) => {
      const priceA = a.price_monthly ?? Number.POSITIVE_INFINITY
      const priceB = b.price_monthly ?? Number.POSITIVE_INFINITY
      return priceA - priceB
    })
    const requiredIds = new Set(
      ranked
        .slice(0, Math.min(2, ranked.length))
        .map((item) => item.product_id),
    )

    const synced = items.map((item) => ({
      ...item,
      is_required: requiredIds.has(item.product_id),
    }))

    sessionStorage.setItem('protocol_items', JSON.stringify(synced))
    sessionStorage.setItem('selected_plan', selectedPlan)
    sessionStorage.removeItem('cart_locked_plan')
    if (!sessionStorage.getItem('checkout_source')) {
      sessionStorage.setItem('checkout_source', 'full_quiz')
    }
    router.push('/checkout')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <p className="text-[#13244f]/60 font-medium">
          Carregando seu protocolo...
        </p>
      </div>
    )
  }

  if (items.length === 0) return null

  const activeItems = getActiveItems()
  const approvedNames = formatProductList(
    activeItems.map((i) => i.product_name),
  )
  const totalSavings = getTotalSavings()
  const installmentCount = getPlanInstallmentCount(selectedPlan)
  const totalPrice = getTotalPrice()
  const installmentTotal =
    installmentCount > 1 ? totalPrice / installmentCount : totalPrice

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-[#f5f0eb] px-6 pt-5 pb-4">
        <div className="max-w-2xl lg:max-w-5xl mx-auto">
          <Image
            src="/logo-azul.png"
            alt="Desafio Diabetes"
            width={455}
            height={355}
            className="h-7 w-auto mb-5"
          />

          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-[#13244f]">
              <span className="w-4 h-4 rounded-full bg-[#13244f] text-white flex items-center justify-center text-[10px]">
                ✓
              </span>
              Protocolo
            </span>
            <span className="flex-1 h-px bg-[#13244f]/20" />
            <span className="flex items-center gap-1.5 text-[#13244f] font-semibold">
              <span className="w-4 h-4 rounded-full bg-[#13244f] text-white flex items-center justify-center text-[10px]">
                2
              </span>
              Checkout
            </span>
            <span className="flex-1 h-px bg-[#13244f]/20" />
            <span className="flex items-center gap-1.5 text-[#13244f]/40">
              <span className="w-4 h-4 rounded-full border border-[#13244f]/30 flex items-center justify-center text-[10px]">
                3
              </span>
              Prescrição
            </span>
            <span className="flex-1 h-px bg-[#13244f]/20" />
            <span className="flex items-center gap-1.5 text-[#13244f]/40">
              <span className="w-4 h-4 rounded-full border border-[#13244f]/30 flex items-center justify-center text-[10px]">
                4
              </span>
              Entrega
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl lg:max-w-5xl mx-auto px-6 pb-12 pt-6 space-y-6">
        <Image
          src="/linha-suplementos.png"
          alt="Linha de suplementos Desafio Diabetes"
          width={1024}
          height={1024}
          priority
          className="w-full max-h-72 md:max-h-96 object-cover rounded-2xl"
        />

        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-1">
                SEU PROTOCOLO
              </p>
              <h1 className="font-display text-2xl md:text-3xl text-[#13244f]">
                Este é o protocolo prescrito para você
              </h1>
              <p className="text-[#13244f]/80 text-sm md:text-base mt-1">
                Avaliado por um profissional habilitado do Desafio Diabetes.
                {approvedNames ? (
                  <>
                    {' '}
                    Inclui{' '}
                    <strong className="text-[#13244f] font-semibold">
                      {approvedNames}
                    </strong>
                    .
                  </>
                ) : null}
              </p>
              <p className="text-[#13244f]/70 text-sm mt-3">
                Já selecionamos os dois suplementos mais recomendados ao seu
                perfil.
              </p>
            </div>

            <fieldset className="space-y-3">
              <legend className="sr-only">Suplementos disponíveis</legend>
              {items.map((item) => {
                const isChecked = !item.removed
                const price = getPrice(item)
                const qty = item.quantity ?? 1
                const discount =
                  getSubscriptionDiscountAmount(
                    item.price_monthly ?? 0,
                    selectedPlan,
                  ) * qty
                const itemInstallments = getPlanInstallmentCount(selectedPlan)
                const itemInstallment =
                  itemInstallments > 1
                    ? getInstallmentPrice(
                        item.price_monthly ?? 0,
                        selectedPlan,
                      ) * qty
                    : price

                return (
                  <label
                    key={item.product_id}
                    className={`flex items-start gap-3 bg-white rounded-2xl border p-4 shadow-sm cursor-pointer transition ${
                      isChecked
                        ? 'border-[#13244f] ring-1 ring-[#13244f]/20'
                        : 'border-gray-100 hover:border-[#13244f]/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleItem(item.product_id)}
                      className="mt-1 w-5 h-5 rounded border-gray-300 text-[#13244f] accent-[#13244f] flex-shrink-0 cursor-pointer"
                    />
                    <div className="flex items-start justify-between gap-4 flex-1 min-w-0">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt=""
                            width={56}
                            height={56}
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-[#ececec] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-[#13244f] md:text-base">
                              {qty > 1 ? `${qty}× ` : ''}
                              {item.product_name}
                            </span>
                            {item.is_required && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#13244f]/10 text-[#13244f]">
                                Recomendado
                              </span>
                            )}
                          </div>
                          <p className="text-sm md:text-base text-[#13244f]/75 leading-relaxed">
                            {item.activation_reason}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {itemInstallments > 1 ? (
                          <>
                            <p className="font-bold text-[#13244f]">
                              {itemInstallments}× R${' '}
                              {formatBRL(itemInstallment)}
                            </p>
                            <p className="text-xs text-[#13244f]/60">
                              Total R$ {formatBRL(price)}
                            </p>
                          </>
                        ) : (
                          <p className="font-bold text-[#13244f]">
                            R$ {formatBRL(price)}
                          </p>
                        )}
                        {discount > 0 && (
                          <p className="text-xs text-green-700">
                            −R$ {formatBRL(discount)}
                          </p>
                        )}
                      </div>
                    </div>
                  </label>
                )
              })}
            </fieldset>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase">
                Forma de compra
              </p>
              <div className="grid gap-2">
                {PURCHASE_PLAN_TYPES.map((plan) => {
                  const selected = selectedPlan === plan
                  const planTotal = getTotalForPlan(plan)
                  const count = getPlanInstallmentCount(plan)
                  const installment =
                    count > 1 && activeItems.length > 0
                      ? planTotal / count
                      : planTotal

                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                        selected
                          ? 'border-[#13244f] bg-[#13244f]/5'
                          : 'border-gray-200 hover:border-[#13244f]/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#13244f]">
                            {PLAN_TYPE_LABEL[plan]}
                          </p>
                          <p className="text-xs text-[#13244f]/70 mt-0.5">
                            {PLAN_HINT[plan]}
                          </p>
                          {activeItems.length > 0 && (
                            <p className="text-sm font-semibold text-[#13244f] mt-2">
                              {count > 1
                                ? `${count}× de R$ ${formatBRL(installment)}`
                                : `R$ ${formatBRL(planTotal)}`}
                            </p>
                          )}
                          {count > 1 && activeItems.length > 0 && (
                            <p className="text-xs text-[#13244f]/60">
                              Total do ciclo R$ {formatBRL(planTotal)}
                            </p>
                          )}
                        </div>
                        {PLAN_BADGE[plan] && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#13244f]/10 text-[#13244f] whitespace-nowrap">
                            {PLAN_BADGE[plan]}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm md:text-base text-[#13244f]/70">
                  {activeItems.length}{' '}
                  {activeItems.length === 1 ? 'produto' : 'produtos'}
                </span>
                <div className="text-right">
                  {installmentCount > 1 ? (
                    <>
                      <p className="text-2xl font-bold text-[#13244f]">
                        {installmentCount}× R$ {formatBRL(installmentTotal)}
                      </p>
                      <p className="text-xs text-[#13244f]/60">
                        Total hoje R$ {formatBRL(totalPrice)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-[#13244f]">
                        R$ {formatBRL(totalPrice)}
                      </p>
                      <p className="text-xs text-[#13244f]/60">Total hoje</p>
                    </>
                  )}
                  {totalSavings > 0 && (
                    <p className="text-[11px] text-green-700 mt-0.5">
                      Você economiza R$ {formatBRL(totalSavings)}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleContinue}
                disabled={activeItems.length === 0}
                className="w-full bg-[#f4001e] hover:bg-[#a30000] text-white py-4 rounded-full font-bold text-sm transition active:scale-95 disabled:opacity-40"
              >
                Garantir meu protocolo
              </button>

              <div className="flex items-center justify-center gap-4 text-xs text-[#13244f]/50">
                <span className="flex items-center gap-1">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="3"
                      y="11"
                      width="18"
                      height="11"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M7 11V7a5 5 0 0110 0v4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  Pagamento seguro
                </span>
                <span>·</span>
                <span>Farmácia credenciada ANVISA</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase mb-3">
                Perguntas frequentes
              </p>
              <div className="divide-y divide-[#ececec]">
                {FAQ_ITEMS.map((item) => {
                  const open = openFaq === item.id
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenFaq((current) =>
                            current === item.id ? null : item.id,
                          )
                        }
                        className="w-full flex items-center justify-between gap-4 py-4 text-left"
                        aria-expanded={open}
                      >
                        <span className="font-semibold text-[#13244f] text-sm">
                          {item.q}
                        </span>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          className={`flex-shrink-0 text-[#13244f] transition-transform duration-300 ${
                            open ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        >
                          <path
                            d="M5 8.5L12 15.5L19 8.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          open
                            ? 'max-h-[32rem] opacity-100 pb-4'
                            : 'max-h-0 opacity-0'
                        }`}
                      >
                        <p className="text-sm text-[#13244f]/80 leading-relaxed">
                          {item.a}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-8">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <p className="text-xs font-bold tracking-widest text-[#f4001e] uppercase">
                Confiança
              </p>
              <h2 className="font-display text-xl text-[#13244f] leading-snug">
                Protocolo sob medida
              </h2>
              <ul className="space-y-2 text-sm md:text-base text-[#13244f]/80">
                <li>Avaliado por profissional habilitado</li>
                <li>Farmácia credenciada ANVISA</li>
                <li>Pagamento seguro</li>
                <li>Frete calculado no checkout</li>
              </ul>
            </div>
          </aside>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-5 text-sm md:text-base text-[#13244f]/85 leading-relaxed space-y-2">
          <p className="font-semibold text-[#13244f]">Vale lembrar:</p>
          <p>
            — Este protocolo é uma sugestão inicial. A partir dele, um
            profissional habilitado do Desafio Diabetes avalia seu caso e
            define, quando necessário, sua prescrição.
          </p>
          <p>
            — Os suplementos são manipulados e dispensados por farmácias
            credenciadas pela Anvisa.
          </p>
        </div>
      </main>
    </div>
  )
}
