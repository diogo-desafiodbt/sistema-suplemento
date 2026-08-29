'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Botao } from '@/components/admin/ui/Botao'
import { Selo } from '@/components/admin/ui/Selo'

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

// Tom do selo, não classe de cor: a cor vive no `admin.css`, com o resto.
const statusTom: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  pending: 'neutro',
  sent_to_pharmacy: 'neutro',
  dispatched: 'atencao',
  delivered: 'ok',
  failed: 'perigo',
}

export function PedidosActions({ orders }: { orders: OrderRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function callAction(
    orderId: string,
    path: string,
    opts?: { openUrl?: boolean },
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
    <div className="admin-card" style={{ padding: '14px 0 4px' }}>
      <div className="admin-tabela-wrap">
        <table className="admin-tabela">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Rastreio</th>
              <th>Data</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const busy = busyId === order.id
              const canGenerate =
                order.status === 'sent_to_pharmacy' && !order.shipping_request_id
              const hasLabel = !!order.shipping_request_id

              return (
                <tr key={order.id}>
                  <td>
                    <p className="admin-nome">{order.users?.full_name}</p>
                    <p className="admin-sub">{order.users?.client_code}</p>
                  </td>
                  <td>
                    <Selo tom={statusTom[order.status] ?? 'neutro'}>
                      {statusLabel[order.status] ?? order.status}
                    </Selo>
                  </td>
                  <td className="admin-num" style={{ fontWeight: 500 }}>
                    R$ {order.total_amount?.toFixed(2).replace('.', ',')}
                  </td>
                  <td className="admin-mono">{order.tracking_code ?? '—'}</td>
                  <td className="admin-sub admin-num">
                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 6,
                        minWidth: '10rem',
                      }}
                    >
                      {canGenerate && (
                        <Botao
                          disabled={busy}
                          onClick={() => callAction(order.id, 'gerar-etiqueta')}
                        >
                          {busy ? 'Gerando…' : 'Gerar etiqueta agora'}
                        </Botao>
                      )}
                      {hasLabel && (
                        <>
                          <Botao
                            variante="secundario"
                            disabled={busy}
                            onClick={() => callAction(order.id, 'atualizar-rastreio')}
                          >
                            Atualizar rastreio
                          </Botao>
                          <Botao
                            variante="secundario"
                            disabled={busy}
                            onClick={() =>
                              callAction(order.id, 'pdf-etiqueta', { openUrl: true })
                            }
                          >
                            Baixar PDF da etiqueta
                          </Botao>
                        </>
                      )}
                      {!canGenerate && !hasLabel && (
                        <span className="admin-sub">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
