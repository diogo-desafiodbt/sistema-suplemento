'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AddedToCartDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  productImage: string
  productPrice?: number
  onFinish: () => void
  onContinue: () => void
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function AddedToCartDialog({
  open,
  onOpenChange,
  productName,
  productImage,
  productPrice,
  onFinish,
  onContinue,
}: AddedToCartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <img
              src={productImage}
              alt={productName}
              className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
            />
            <div className="flex flex-col gap-1 min-w-0">
              <DialogTitle>{productName} adicionado ao carrinho</DialogTitle>
              {productPrice != null && (
                <p className="text-sm font-semibold text-[#13244f]">
                  R$ {formatPrice(productPrice)}/mês
                </p>
              )}
            </div>
          </div>
          <DialogDescription>
            Quer continuar comprando ou finalizar a compra agora?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onContinue}>
            Continuar comprando
          </Button>
          <Button
            className="bg-[#f4001e] hover:bg-[#a30000] text-white"
            onClick={onFinish}
          >
            Finalizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
