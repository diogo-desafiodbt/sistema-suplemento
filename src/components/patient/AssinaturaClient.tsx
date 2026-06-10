'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'

type Subscription = {
  id: string
  plan_type: string
  status: string
  expires_at: string | null
  grace_period_ends_at: string | null
} | null

type Payment = {
  amount: number | null
  status: string
  paid_at: string | null
}

type Props = {
  subscription: Subscription
  payments: Payment[]
}

const planLabels: Record<string, string> = {
  '1mes': 'Mensal',
  '3meses': 'Trimestral',
  '1ano': 'Anual',
}

const statusLabels: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-green-50 text-green-700' },
  past_due: { label: 'Pagamento pendente', className: 'bg-yellow-50 text-yellow-700' },
  grace_period: { label: 'Em carência', className: 'bg-yellow-50 text-yellow-700' },
  canceled: { label: 'Cancelada', className: 'bg-gray-100 text-gray-500' },
  expired: { label: 'Expirada', className: 'bg-gray-100 text-gray-500' },
}

const paymentStatusLabels: Record<string, { label: string; className: string }> = {
  paid: { label: 'Pago', className: 'text-green-600' },
  pending: { label: 'Pendente', className: 'text-yellow-600' },
  failed: { label: 'Falhou', className: 'text-red-500' },
  refunded: { label: 'Estornado', className: 'text-gray-400' },
}

export function AssinaturaClient({ subscription, payments }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [canceled, setCanceled] = useState(false)

  const canCancel =
    !canceled &&
    subscription !== null &&
    ['active', 'past_due', 'grace_period'].includes(subscription.status)

  const currentStatus = canceled ? 'canceled' : (subscription?.status ?? 'expired')
  const statusInfo = statusLabels[currentStatus] ?? statusLabels.expired

  async function handleCancel() {
    setLoading(true)
    try {
      const res = await fetch('/api/assinatura/cancelar', { method: 'POST' })
      if (!res.ok) throw new Error()
      setCanceled(true)
      setShowModal(false)
      toast.success('Renovação cancelada. Seu acesso continua até o fim do período pago.')
    } catch {
      toast.error('Erro ao cancelar. Tente novamente ou entre em contato com o suporte.')
    } finally {
      setLoading(false)
    }
  }

  if (!subscription) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
        <p className="text-[#13244f] font-medium">Você não tem uma assinatura ativa.</p>
        <Link
          href="/recomendacoes"
          className="inline-block bg-[#f4001e] text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-[#a30000] transition"
        >
          Iniciar tratamento
        </Link>
      </div>
    )
  }

  const expiresAt = subscription.expires_at
    ? new Date(subscription.expires_at).toLocaleDateString('pt-BR')
    : '—'

  return (
    <>
      <div className="space-y-4">

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Plano atual</p>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-[#13244f]">
                {planLabels[subscription.plan_type] ?? subscription.plan_type}
              </p>
              <p className="text-sm text-gray-400 mt-0.5">
                {canceled
                  ? `Renovação cancelada — acesso até ${expiresAt}`
                  : `Válido até ${expiresAt}`}
              </p>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          </div>

          {canCancel && (
            <button
              onClick={() => setShowModal(true)}
              className="text-sm text-gray-400 hover:text-[#f4001e] transition underline"
            >
              Cancelar renovação automática
            </button>
          )}

          {canceled && (
            <p className="text-sm text-gray-400">
              Renovação cancelada. Seu acesso continua até {expiresAt}.{' '}
              <Link href="/recomendacoes" className="text-[#f4001e] hover:underline font-medium">
                Reativar tratamento
              </Link>
            </p>
          )}

          {currentStatus === 'expired' && !canceled && (
            <Link
              href="/recomendacoes"
              className="inline-block text-sm text-[#f4001e] font-semibold hover:underline"
            >
              Reativar tratamento →
            </Link>
          )}
        </div>

        {payments.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Histórico de pagamentos</p>
            <div className="space-y-3">
              {payments.map((payment, i) => {
                const pStatus = paymentStatusLabels[payment.status] ?? { label: payment.status, className: 'text-gray-400' }
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      {payment.paid_at
                        ? new Date(payment.paid_at).toLocaleDateString('pt-BR')
                        : '—'}
                    </span>
                    <span className="font-semibold text-[#13244f]">
                      R$ {((payment.amount ?? 0) / 100).toFixed(2).replace('.', ',')}
                    </span>
                    <span className={`font-medium ${pStatus.className}`}>{pStatus.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#13244f]">Cancelar renovação?</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Ao cancelar, sua assinatura não será renovada. Você continuará com acesso ao tratamento até <strong className="text-[#13244f]">{expiresAt}</strong> e, após essa data, o acesso será encerrado automaticamente.
            </p>
            <p className="text-sm text-gray-500">
              Para retomar o tratamento depois, será necessário iniciar um novo protocolo.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="flex-1 border border-gray-200 text-[#13244f] font-semibold py-2.5 rounded-full text-sm hover:bg-gray-50 transition disabled:opacity-50"
              >
                Manter assinatura
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 bg-[#f4001e] text-white font-bold py-2.5 rounded-full text-sm hover:bg-[#a30000] transition disabled:opacity-50"
              >
                {loading ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
