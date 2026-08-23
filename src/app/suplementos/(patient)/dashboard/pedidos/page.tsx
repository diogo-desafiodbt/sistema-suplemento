import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import imgLogoAzul from '@/../public/logo-azul.png'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { perguntarAoNucleo } from '@/lib/contrato/nucleo'
import {
  getPatientOrderStatus,
  getPatientOrderStatusColor,
} from '@/lib/order-status'
import { getProductDisplayName } from '@/lib/product-display-names'
import { sessaoAtual } from '@/lib/auth/sessao'
import { findSupplementImageByProductName } from '@/lib/supplements-content'

type OrderItem = {
  id: string
  quantity: number
  unit_price: number
  products: { name: string } | null
}

type Pedido = {
  id: string
  status: string
  created_at: string | null
  tracking_code: string | null
  pharmacy_sent_at: string | null
  total_amount: number | null
  itens: OrderItem[]
}

export default async function PedidosPage() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/suplementos/login')

  const res = await perguntarAoNucleo<{ pedidos: Pedido[] }>('meus-pedidos')
  if (!res) redirect('/suplementos/login')
  const orderList = res.pedidos

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between">
        <Image
          src={imgLogoAzul}
          alt="Desafio Diabetes"
          width={455}
          height={355}
          className="h-7 w-auto"
        />
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="text-sm text-[#f4001e] font-medium hover:underline"
          >
            Sair
          </button>
        </form>
      </header>

      <DashboardNav />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
            Acompanhamento
          </p>
          <h1 className="text-2xl font-bold text-[#13244f]">Meus pedidos</h1>
        </div>

        {orderList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500 text-sm">
            Nenhum pedido ainda. Seu primeiro pedido será gerado após a
            confirmação do pagamento.
          </div>
        ) : (
          orderList.map((order) => {
            const message = getPatientOrderStatus(
              order.status,
              order.tracking_code,
              order.pharmacy_sent_at,
            )

            return (
              <Link
                key={order.id}
                href={`/suplementos/dashboard/pedidos/${order.id}`}
                className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 hover:border-[#13244f]/30 transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">
                    Pedido de{' '}
                    {order.created_at
                      ? new Date(order.created_at).toLocaleDateString('pt-BR')
                      : '—'}
                  </span>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full ${getPatientOrderStatusColor(message)}`}
                  >
                    {message}
                  </span>
                </div>

                <div className="space-y-3">
                  {order.itens?.map((item) => {
                    const name = item.products?.name ?? 'Produto'
                    const image = findSupplementImageByProductName(name)
                    const displayName = getProductDisplayName(name)
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#f5f0eb] overflow-hidden shrink-0 flex items-center justify-center">
                          {image ? (
                            <Image
                              src={image}
                              alt={displayName}
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <rect
                                x="4"
                                y="7"
                                width="16"
                                height="13"
                                rx="2"
                                stroke="#13244f"
                                strokeOpacity="0.35"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M8 7V5a4 4 0 018 0v2"
                                stroke="#13244f"
                                strokeOpacity="0.35"
                                strokeWidth="1.5"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#13244f] truncate">
                            {displayName}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.quantity > 1 ? `${item.quantity}× ` : ''}
                            R$ {item.unit_price?.toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-sm font-bold text-[#13244f]">
                    Total: R${' '}
                    {(order.total_amount ?? 0).toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-xs font-bold text-[#13244f]/60">
                    Ver detalhes →
                  </span>
                </div>
              </Link>
            )
          })
        )}
      </main>
    </div>
  )
}
