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
import type { PlanType } from '@/types/protocol'

type CartDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PLAN_LABELS: Record<PlanType, string> = {
  '1mes': '1 mês',
  '3meses': '3 meses',
  '1ano': '1 ano',
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const router = useRouter()
  const { items, removeItem, plan } = useCart()

  const total = items.reduce(
    (sum, item) => sum + item.price_monthly * item.quantity,
    0
  )

  const handleFinish = () => {
    onOpenChange(false)
    router.push('/quiz')
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
              <p className="text-xs font-medium text-[#13244f] bg-[#13244f]/5 rounded-lg px-3 py-2 mb-2">
                Plano selecionado: {PLAN_LABELS[plan]}
              </p>
              <ul className="divide-y divide-[#ececec]">
                {items.map((item) => (
                  <li key={item.product_id} className="py-4 flex gap-3">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-[#ececec] flex-shrink-0" />
                    )}
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-semibold text-[#13244f] text-sm">
                        {item.name}
                        {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                      </span>
                      <span className="text-sm text-gray-600">
                        R$ {formatPrice(item.price_monthly)}/mês
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id)}
                        className="self-start text-xs font-medium text-[#f4001e] hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <SheetFooter>
          <div className="flex items-center justify-between text-sm font-semibold text-[#13244f]">
            <span>Total</span>
            <span>R$ {formatPrice(total)}/mês</span>
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
