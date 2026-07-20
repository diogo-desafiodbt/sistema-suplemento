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
  onFinish: () => void
  onContinue: () => void
}

export default function AddedToCartDialog({
  open,
  onOpenChange,
  productName,
  onFinish,
  onContinue,
}: AddedToCartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{productName} adicionado ao carrinho</DialogTitle>
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
