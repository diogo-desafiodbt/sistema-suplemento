'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function ObrigadoPage() {
  const router = useRouter()

  useEffect(() => {
    sessionStorage.removeItem('protocol_items')
    sessionStorage.removeItem('selected_plan')
    sessionStorage.removeItem('quiz_data')
    sessionStorage.removeItem('protocol_id')
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Pedido confirmado!</h1>
          <p className="text-gray-500 mt-2">
            Seu tratamento foi processado com sucesso. Em breve você receberá um email com os detalhes e a prescrição assinada pelo médico.
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4 text-left space-y-2">
          <p className="text-sm font-medium">Próximos passos:</p>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>✓ Pagamento confirmado</li>
            <li>⏳ Médico assina sua prescrição (até 24h)</li>
            <li>⏳ Farmácia prepara e envia seu pedido</li>
            <li>⏳ Entrega em 3 a 7 dias úteis</li>
          </ul>
        </div>

        <Button onClick={() => router.push('/dashboard')} className="w-full" size="lg">
          Acessar minha área
        </Button>
      </div>
    </div>
  )
}
