import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import imgLogoAzul from '@/../public/logo-azul.png'
import { CopyButton } from '@/components/CopyButton'
import { DashboardNav } from '@/components/patient/DashboardNav'
import { perguntarAoNucleo } from '@/lib/contrato/nucleo'
import {
  getPatientOrderStatus,
  getPatientOrderStatusColor,
} from '@/lib/order-status'
import { getProductDisplayName } from '@/lib/product-display-names'
import {
  addBusinessDays,
  estimateCustomerDeliveryDays,
} from '@/lib/shipping/estimate'
import { createClient } from '@/lib/supabase/server'
import { findSupplementImageByProductName } from '@/lib/supplements-content'

type OrderItem = {
  id: string
  quantity: number
  unit_price: number
  products: { name: string } | null
}

type TrackingEvent = {
  datahora?: string
  descricao?: string | null
  local?: string | null
  cidade?: string | null
  finalizado?: number
}

type PharmacyJsonAddress = {
  EntregaLogradouro?: string
  EntregaLogradouroNumero?: string
  EntregaLogradouroComplemento?: string
  EntregaBairro?: string
  EntregaMunicipioNome?: string
  EntregaUnidadeFederativa?: string
  EntregaCEP?: string
}

type PedidoDetalhe = {
  id: string
  status: string
  created_at: string | null
  total_amount: number | null
  tracking_code: string | null
  pharmacy_sent_at: string | null
  shipping_quote_json: {
    tipo?: string
    valor?: number
    prazoDias?: number
  } | null
  pharmacy_json: PharmacyJsonAddress | null
  payment_method: 'credit_card' | 'pix' | null
  rastreamento: TrackingEvent[]
  itens: OrderItem[]
}

function fmtCep(cep: string): string {
  const digits = cep.replace(/\D/g, '')
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : cep
}

function money(value: number | null | undefined): string {
  return `R$ ${(value ?? 0).toFixed(2).replace('.', ',')}`
}

export default async function PedidoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const { id } = await params

  const orderData = await perguntarAoNucleo<PedidoDetalhe>('meu-pedido', {
    order_id: id,
  })
  if (!orderData) notFound()

  const statusMessage = getPatientOrderStatus(
    orderData.status,
    orderData.tracking_code,
    orderData.pharmacy_sent_at,
  )

  const eventos = [...(orderData.rastreamento ?? [])].sort((a, b) => {
    const ta = a.datahora ? new Date(a.datahora).getTime() : 0
    const tb = b.datahora ? new Date(b.datahora).getTime() : 0
    return ta - tb
  })

  const delivered = orderData.status === 'delivered'
  const deliveredEvent = eventos.find((ev) => ev.finalizado === 1)

  const prazoDias = orderData.shipping_quote_json?.prazoDias
  const estimatedDate =
    !delivered &&
    typeof prazoDias === 'number' &&
    prazoDias > 0 &&
    orderData.created_at
      ? addBusinessDays(
          new Date(orderData.created_at),
          estimateCustomerDeliveryDays(prazoDias),
        )
      : null

  const pharmacy = orderData.pharmacy_json
  const address = pharmacy?.EntregaLogradouro ? pharmacy : null
  const paymentMethod = orderData.payment_method
  const freteValor = orderData.shipping_quote_json?.valor

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
          <Link
            href="/suplementos/dashboard/pedidos"
            className="text-xs text-[#13244f]/60 hover:text-[#13244f] transition"
          >
            ← Voltar para meus pedidos
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
              Pedido de{' '}
              {orderData.created_at
                ? new Date(orderData.created_at).toLocaleDateString('pt-BR')
                : '—'}
            </p>
            <h1 className="text-2xl font-bold text-[#13244f]">
              Detalhes do pedido
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full ${getPatientOrderStatusColor(statusMessage)}`}
            >
              {statusMessage}
            </span>
            {eventos.length > 0 && eventos[eventos.length - 1]?.datahora && (
              <p className="text-xs text-gray-400">
                Atualizado em{' '}
                {(() => {
                  const d = new Date(eventos[eventos.length - 1].datahora!)
                  const day = d.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })
                  const time = d.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  return `${day} às ${time}`
                })()}
              </p>
            )}
          </div>
        </div>

        {delivered
          ? deliveredEvent?.datahora && (
              <div className="bg-green-50 border border-green-100 rounded-2xl px-5 py-4 text-sm text-green-800 font-semibold">
                Entregue em{' '}
                {new Date(deliveredEvent.datahora).toLocaleDateString('pt-BR')}
              </div>
            )
          : estimatedDate && (
              <div className="bg-[#13244f]/5 border border-[#13244f]/10 rounded-2xl px-5 py-4 text-sm text-[#13244f] font-semibold">
                Previsão de entrega: até{' '}
                {estimatedDate.toLocaleDateString('pt-BR')}
              </div>
            )}

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-4">
            Produtos
          </p>
          <div className="space-y-4">
            {orderData.itens?.map((item) => {
              const name = item.products?.name ?? 'Produto'
              const image = findSupplementImageByProductName(name)
              const displayName = getProductDisplayName(name)
              return (
                <div key={item.id} className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-[#f5f0eb] overflow-hidden shrink-0 flex items-center justify-center">
                    {image ? (
                      <Image
                        src={image}
                        alt={displayName}
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg
                        width="22"
                        height="22"
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
                    <p className="text-sm font-semibold text-[#13244f]">
                      {displayName}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Quantidade: {item.quantity ?? 1}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-[#13244f] shrink-0">
                    {money(item.unit_price)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-3">
            Rastreio
          </p>
          {orderData.tracking_code ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-[#13244f] bg-[#f5f0eb] px-3 py-1.5 rounded-lg">
                {orderData.tracking_code}
              </span>
              <CopyButton
                value={orderData.tracking_code}
                label="Copiar código"
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              O código de rastreio aparece aqui assim que o pedido for
              despachado.
            </p>
          )}

          <div className="mt-5 border-t border-gray-100 pt-4">
            {eventos.length === 0 ? (
              <p className="text-sm text-gray-400">
                Aguardando atualização de rastreio
              </p>
            ) : (
              <ol>
                {eventos.map((ev, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: eventos vêm de um payload externo de rastreio sem id estável; a lista é somente leitura e reordenada por data a cada render
                  <li key={i} className="relative flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                          ev.finalizado === 1 ? 'bg-green-600' : 'bg-[#13244f]'
                        }`}
                      />
                      {i < eventos.length - 1 && (
                        <div className="w-px flex-1 bg-[#13244f]/15 my-1" />
                      )}
                    </div>
                    <div className={i < eventos.length - 1 ? 'pb-5' : ''}>
                      <p className="text-sm font-semibold text-[#13244f]">
                        {ev.descricao ?? 'Atualização de rastreio'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ev.datahora
                          ? new Date(ev.datahora).toLocaleString('pt-BR')
                          : '—'}
                        {(ev.local || ev.cidade) &&
                          ` — ${[ev.local, ev.cidade].filter(Boolean).join(', ')}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-3">
            Endereço de entrega
          </p>
          {address ? (
            <div className="text-sm text-[#13244f]">
              <p>
                {address.EntregaLogradouro}, {address.EntregaLogradouroNumero}
                {address.EntregaLogradouroComplemento
                  ? ` — ${address.EntregaLogradouroComplemento}`
                  : ''}
              </p>
              <p className="text-gray-500 mt-0.5">
                {address.EntregaBairro} — {address.EntregaMunicipioNome}/
                {address.EntregaUnidadeFederativa}
                {address.EntregaCEP
                  ? ` — CEP ${fmtCep(address.EntregaCEP)}`
                  : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              O endereço de entrega será confirmado quando o pedido for
              processado.
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-3">
            Pagamento
          </p>
          <div className="space-y-2 text-sm">
            {typeof freteValor === 'number' && (
              <div className="flex justify-between text-gray-500">
                <span>Frete</span>
                <span>{money(freteValor)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[#13244f]">
              <span>Total</span>
              <span>{money(orderData.total_amount)}</span>
            </div>
            {paymentMethod && (
              <div className="flex justify-between text-gray-500 border-t border-gray-100 pt-2">
                <span>Forma de pagamento</span>
                <span className="font-semibold text-[#13244f]">
                  {paymentMethod === 'pix' ? 'Pix' : 'Cartão de crédito'}
                </span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
