'use client'

import { useState } from 'react'
import { toast } from 'sonner'

type OrderRow = {
  id: string
  status: string
  created_at: string
  tracking_code: string | null
  total_amount: number
  shipping_request_id: string | null
  users: {
    full_name: string
    email: string
    client_code: string
  } | null
}

const statusLabel: Record<string, string> = {
  pending: 'Aguardando',
  sent_to_pharmacy: 'Na farmácia',
  dispatched: 'A caminho',
  delivered: 'Entregue',
  failed: 'Falhou',
}

const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  sent_to_pharmacy: 'bg-blue-50 text-blue-700',
  dispatched: 'bg-amber-50 text-amber-700',
  delivered: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-700',
}

export function PedidosActions({ orders }: { orders: OrderRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function callAction(
    orderId: string,
    path: string,
    opts?: { openUrl?: boolean }
  ) {
    setBusyId(orderId)
    try {
      const res = await fetch(`/api/admin/pedidos/${orderId}/${path}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Falha na operação')
        return
      }
      if (opts?.openUrl && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
        toast.success('PDF aberto em nova aba')
        return
      }
      toast.success('Operação concluída')
      window.location.reload()
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Paciente</th>
            <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Status</th>
            <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Valor</th>
            <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Rastreio</th>
            <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Data</th>
            <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">Ações</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => {
            const busy = busyId === order.id
            const canGenerate =
              order.status === 'sent_to_pharmacy' && !order.shipping_request_id
            const hasLabel = !!order.shipping_request_id

            return (
              <tr key={order.id} className="border-b border-gray-50 hover:bg-[#f5f0eb]/50 transition-colors">
                <td className="px-5 py-4">
                  <p className="font-semibold text-[#13244f]">{order.users?.full_name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{order.users?.client_code}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColor[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel[order.status] ?? order.status}
                  </span>
                </td>
                <td className="px-5 py-4 font-semibold text-[#13244f]">
                  R$ {order.total_amount?.toFixed(2).replace('.', ',')}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-gray-400">
                  {order.tracking_code ?? '—'}
                </td>
                <td className="px-5 py-4 text-gray-400 text-xs">
                  {new Date(order.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-1.5 min-w-[10rem]">
                    {canGenerate && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => callAction(order.id, 'gerar-etiqueta')}
                        className="text-xs font-semibold text-white bg-[#13244f] hover:bg-[#0e1b3d] rounded-full px-3 py-1.5 disabled:opacity-50"
                      >
                        {busy ? '…' : 'Gerar etiqueta agora'}
                      </button>
                    )}
                    {hasLabel && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => callAction(order.id, 'atualizar-rastreio')}
                          className="text-xs font-semibold text-[#13244f] border border-[#13244f]/30 hover:bg-[#13244f]/5 rounded-full px-3 py-1.5 disabled:opacity-50"
                        >
                          Atualizar rastreio agora
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            callAction(order.id, 'pdf-etiqueta', { openUrl: true })
                          }
                          className="text-xs font-semibold text-[#f4001e] border border-[#f4001e]/30 hover:bg-[#f4001e]/5 rounded-full px-3 py-1.5 disabled:opacity-50"
                        >
                          Baixar PDF da etiqueta
                        </button>
                      </>
                    )}
                    {!canGenerate && !hasLabel && (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
