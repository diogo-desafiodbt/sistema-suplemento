'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCart } from '@/lib/use-cart'
import {
  PLAN_HINT,
  PLAN_LABELS,
  PURCHASE_PLAN_TYPES,
  getChargePrice,
  getSubscriptionDiscountAmount,
  type PurchasePlanType,
} from '@/lib/plans'

type CartDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const router = useRouter()
  const { items, removeItem, plan, setPlan, chargeTotal } = useCart()

  const handleFinish = () => {
    onOpenChange(false)
    router.push('/checkout/triagem')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Carrinho</SheetTitle>
          <p className="text-xs text-gray-500 pt-1">🚚 Frete grátis em todos os pedidos</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-4 text-center">
              <img
                src="/categorias/categoria-berberina.png"
                alt="Berberina"
                className="w-28 h-28 rounded-2xl object-cover"
              />
              <p className="text-sm text-[#13244f] leading-relaxed">
                Berberina: um dos ativos mais estudados no apoio ao controle glicêmico.
              </p>
              <Link
                href="/suplementos/berberina"
                onClick={() => onOpenChange(false)}
                className="inline-flex justify-center bg-[#f4001e] hover:bg-[#a30000] text-white rounded-full px-5 py-2.5 text-sm font-semibold transition"
              >
                Ver Berberina
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-3 space-y-2">
                <p className="text-xs font-semibold text-[#13244f]/60 uppercase tracking-wide">
                  Forma de compra
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PURCHASE_PLAN_TYPES.map((p) => {
                    const selected = plan === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlan(p)}
                        className={`rounded-xl border px-2 py-2 text-center transition ${
                          selected
                            ? 'border-[#13244f] bg-[#13244f] text-white'
                            : 'border-gray-200 text-[#13244f] hover:border-[#13244f]/40'
                        }`}
                      >
                        <div className={`text-[10px] font-medium ${selected ? 'text-white/70' : 'text-gray-400'}`}>
                          {p === 'assinatura_mensal' ? '10% off' : 'Avulso'}
                        </div>
                        <div className="text-xs font-bold">{PLAN_LABELS[p]}</div>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-gray-400 text-center">
                  {PLAN_HINT[plan as PurchasePlanType]}
                </p>
              </div>
              <ul className="divide-y divide-[#ececec]">
                {items.map((item) => {
                  const line = getChargePrice(item.price_monthly, plan) * item.quantity
                  const discount = plan === 'assinatura_mensal'
                    ? getSubscriptionDiscountAmount(item.price_monthly) * item.quantity
                    : 0
                  return (
                    <li key={item.product_id} className="flex items-center gap-3 py-3">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-[#ececec]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#13244f] truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">
                          Qtd {item.quantity}
                          {discount > 0 && (
                            <span className="text-green-600"> · −R$ {formatPrice(discount)}</span>
                          )}
                        </p>
                        <p className="text-sm font-semibold text-[#13244f]">
                          R$ {formatPrice(line)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id)}
                        className="text-xs text-gray-400 hover:text-[#f4001e]"
                      >
                        Remover
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <SheetFooter>
          <div className="flex items-center justify-between text-sm font-semibold text-[#13244f]">
            <span>Total</span>
            <span>
              R$ {formatPrice(chargeTotal)}
              {plan === 'assinatura_mensal' ? '/mês' : ''}
            </span>
          </div>
          <Button
            disabled={items.length === 0}
            className="bg-[#f4001e] hover:bg-[#a30000] text-white disabled:opacity-50"
            onClick={handleFinish}
          >
            Finalizar compra
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
