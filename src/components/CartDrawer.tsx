'use client'

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
  const { items, removeItem } = useCart()

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
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              Seu carrinho está vazio
            </p>
          ) : (
            <ul className="divide-y divide-[#ececec]">
              {items.map((item) => (
                <li key={item.product_id} className="py-4 flex flex-col gap-1">
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
                </li>
              ))}
            </ul>
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
