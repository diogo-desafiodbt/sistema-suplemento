import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CopyButton } from '@/components/CopyButton'
import { RFM_TIER_BADGE, RFM_TIER_LABEL } from '@/lib/admin/rfm-tier'
import { asNumber, getSql } from '@/lib/db'
import { createPrescriptionPdfSignedUrl } from '@/lib/pdf/signed-url'
import { PLAN_LABELS } from '@/lib/plans'
import { getProductDisplayName } from '@/lib/product-display-names'
import { isNorteNordeste } from '@/lib/shipping/sender-region'
import { getUserProfile } from '@/lib/auth/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type AddressRow = {
  id?: string
  zip_code: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  is_default: boolean
}

type SubscriptionRow = {
  id: string
  plan_type: string
  status: string
  started_at: string | null
  expires_at: string | null
  next_billing_at: string | null
  pagarme_sub_id: string | null
  retry_count: number | null
  created_at: string
}

type OrderRow = {
  id: string
  status: string
  created_at: string
  total_amount: number | null
  tracking_code: string | null
  pharmacy_sent_at: string | null
  shipping_quote_json: {
    tipo?: string
    valor?: number
    prazoDias?: number
    codigoServico?: string
    transportadora?: string
    nomeServico?: string
  } | null
  shipping_json: { eventos?: TrackingEvent[] } | null
}

type TrackingEvent = {
  datahora?: string
  descricao?: string | null
  local?: string | null
  cidade?: string | null
  finalizado?: number
}

type PaymentRow = {
  id?: string
  subscription_id: string
  amount: number | null
  status: string
  created_at: string
  paid_at: string | null
  pagarme_charge_id: string | null
}

type ProtocolRow = {
  id: string
  status: string
  generated_at: string | null
  signed_at: string | null
  signed_by: string | null
  prescription_pdf_path: string | null
  prescription_pdf_signed_url: string | null
  protocol_items: Array<{
    id: string
    is_required: boolean
    removed_by_patient: boolean
    activation_reason: string | null
    products: { name: string } | null
  }>
}

type ProfessionalRow = {
  id: string
  crm: string | null
  crm_state: string | null
  users: { full_name: string } | null
}

type TermsRow = {
  id?: string
  terms_version: string
  terms_hash: string
  ip_address: string | null
  accepted_at: string
}

const SUB_STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  past_due: 'bg-amber-50 text-amber-700',
  grace_period: 'bg-orange-50 text-orange-700',
  canceled: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-50 text-red-700',
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando',
  sent_to_pharmacy: 'Na farmácia',
  dispatched: 'A caminho',
  delivered: 'Entregue',
  failed: 'Falhou',
}

const ORDER_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  sent_to_pharmacy: 'bg-blue-50 text-blue-700',
  dispatched: 'bg-amber-50 text-amber-700',
  delivered: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-700',
}

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
}

const PROTOCOL_STATUS_LABEL: Record<string, string> = {
  pending_signature: 'Aguardando assinatura',
  signed: 'Assinado',
  rejected: 'Rejeitado',
}

const PROTOCOL_STATUS_BADGE: Record<string, string> = {
  pending_signature: 'bg-amber-50 text-amber-700',
  signed: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
}

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('pt-BR')
}

function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR')
}

function money(value: number | null | undefined): string {
  return `R$ ${(value ?? 0).toFixed(2).replace('.', ',')}`
}

/** Chave/valor legível de um registro genérico (quiz, health record). */
function readableEntries(
  record: Record<string, unknown>,
): Array<[string, string]> {
  const skip = new Set(['id', 'user_id', 'protocol_id'])
  const entries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(record)) {
    if (skip.has(key)) continue
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      entries.push([key, value.map((v) => String(v)).join(', ')])
      continue
    }
    if (typeof value === 'object') {
      entries.push([key, JSON.stringify(value)])
      continue
    }
    if (key.endsWith('_at') || key === 'created_at') {
      entries.push([key, fmtDateTime(String(value))])
      continue
    }
    entries.push([key, String(value)])
  }
  return entries
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-4">
        {title}
      </p>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-400">{text}</p>
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase">
        {label}
      </p>
      <p className="text-sm text-[#13244f] mt-0.5 break-words">
        {value ?? '—'}
      </p>
    </div>
  )
}

export default async function AdminClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const profile = await getUserProfile(user.id)

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const admin = createAdminClient()
  const { id } = await params
  const sql = getSql()

  const clientRows = await sql<
    {
      id: string
      full_name: string
      email: string
      phone: string | null
      cpf: string | null
      client_code: string
      role: string
      created_at: string | Date
    }[]
  >`
    SELECT id, full_name, email, phone, cpf, client_code, role, created_at
    FROM users
    WHERE id = ${id}::uuid
    LIMIT 1
  `
  const client = clientRows[0] ?? null
  if (!client) notFound()

  const [
    rfmRows,
    addresses,
    subscriptions,
    orders,
    protocols,
    quizResponses,
    healthRecords,
    notificationLogs,
    loginHistory,
    termsAcceptances,
  ] = await Promise.all([
    sql<{ tier?: string }[]>`
      SELECT * FROM user_rfm_scores WHERE user_id = ${id}::uuid LIMIT 1
    `,
    sql<AddressRow[]>`
      SELECT * FROM addresses
      WHERE user_id = ${id}::uuid
      ORDER BY is_default DESC
    `,
    sql<SubscriptionRow[]>`
      SELECT * FROM subscriptions
      WHERE user_id = ${id}::uuid
      ORDER BY created_at DESC
    `,
    sql<OrderRow[]>`
      SELECT * FROM orders
      WHERE user_id = ${id}::uuid
      ORDER BY created_at DESC
    `,
    sql<Omit<ProtocolRow, 'prescription_pdf_signed_url'>[]>`
      SELECT p.id, p.status, p.generated_at, p.signed_at, p.signed_by,
             p.prescription_pdf_path,
        COALESCE(it.list, '[]'::jsonb) AS protocol_items
      FROM protocols p
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', pi.id, 'is_required', pi.is_required,
          'removed_by_patient', pi.removed_by_patient,
          'activation_reason', pi.activation_reason,
          'products', CASE WHEN pr.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', pr.name) END
        ) ORDER BY pi.id) AS list
        FROM protocol_items pi LEFT JOIN products pr ON pr.id = pi.product_id
        WHERE pi.protocol_id = p.id) it ON true
      WHERE p.user_id = ${id}::uuid
      ORDER BY p.generated_at DESC
    `,
    sql<Record<string, unknown>[]>`
      SELECT * FROM quiz_responses
      WHERE user_id = ${id}::uuid
      ORDER BY completed_at DESC NULLS LAST
    `,
    sql<Record<string, unknown>[]>`
      SELECT * FROM health_records WHERE user_id = ${id}::uuid
    `,
    sql<Record<string, unknown>[]>`
      SELECT * FROM notification_logs
      WHERE user_id = ${id}::uuid
      ORDER BY sent_at DESC
      LIMIT 20
    `,
    sql<Record<string, unknown>[]>`
      SELECT * FROM user_login_history
      WHERE user_id = ${id}::uuid
      ORDER BY logged_at DESC
      LIMIT 20
    `,
    sql<TermsRow[]>`
      SELECT * FROM terms_acceptances
      WHERE user_id = ${id}::uuid
      ORDER BY accepted_at DESC
    `,
  ])

  const rfm = rfmRows[0] ?? null
  const addressList = addresses
  const subList = subscriptions
  const orderList = orders.map((o) => ({
    ...o,
    total_amount: o.total_amount == null ? null : asNumber(o.total_amount),
  }))
  const protocolList = await Promise.all(
    protocols.map(async (p) => ({
      ...p,
      prescription_pdf_signed_url: await createPrescriptionPdfSignedUrl(
        admin,
        p.prescription_pdf_path,
      ),
    })),
  )
  const quizList = quizResponses
  const healthList = healthRecords
  const notifList = notificationLogs
  const loginList = loginHistory
  const termsList = termsAcceptances

  const subIds = subList.map((s) => s.id)
  const signerIds = [
    ...new Set(
      protocolList.map((p) => p.signed_by).filter((v): v is string => !!v),
    ),
  ]

  const [payments, pros] = await Promise.all([
    subIds.length > 0
      ? sql<PaymentRow[]>`
          SELECT * FROM payments
          WHERE subscription_id = ANY(${sql.array(subIds)}::uuid[])
          ORDER BY created_at DESC
        `
      : Promise.resolve([] as PaymentRow[]),
    signerIds.length > 0
      ? sql<ProfessionalRow[]>`
          SELECT pf.id, pf.crm, pf.crm_state,
            CASE WHEN u.id IS NULL THEN NULL
              ELSE jsonb_build_object('full_name', u.full_name) END AS users
          FROM professionals pf
          LEFT JOIN users u ON u.id = pf.user_id
          WHERE pf.id = ANY(${sql.array(signerIds)}::uuid[])
        `
      : Promise.resolve([] as ProfessionalRow[]),
  ])

  const paymentList = payments.map((p) => ({
    ...p,
    amount: p.amount == null ? null : asNumber(p.amount),
  }))
  const professionalsById = new Map<string, ProfessionalRow>()
  for (const pro of pros) {
    professionalsById.set(pro.id, pro)
  }

  function professionalName(signedBy: string | null): string {
    if (!signedBy) return '—'
    const pro = professionalsById.get(signedBy)
    if (!pro) return '—'
    const name = pro.users?.full_name
    const crm = pro.crm
      ? ` — CRM ${pro.crm}${pro.crm_state ? `/${pro.crm_state}` : ''}`
      : ''
    return `${name ?? '—'}${crm}`
  }

  const defaultAddress = addressList.find((a) => a.is_default) ?? addressList[0]
  const freightOrigin = defaultAddress
    ? isNorteNordeste(defaultAddress.state)
      ? 'Fortaleza (Norte/Nordeste)'
      : 'Curitiba'
    : null

  const tier = rfm?.tier ?? null

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-5">
      <div>
        <Link
          href="/suplementos/admin/clientes"
          className="text-xs text-[#13244f]/60 hover:text-[#13244f] transition"
        >
          ← Voltar para clientes
        </Link>
      </div>

      {/* 2.1 — Cabeçalho */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
              Cliente 360°
            </p>
            <h1 className="text-2xl font-bold text-[#13244f]">
              {client.full_name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#13244f]/10 text-[#13244f]">
              {client.role}
            </span>
            {tier && (
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${RFM_TIER_BADGE[tier] ?? 'bg-gray-100 text-gray-600'}`}
              >
                RFM: {RFM_TIER_LABEL[tier] ?? tier}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="E-mail" value={client.email} />
          <Field label="Telefone" value={client.phone ?? '—'} />
          <Field label="CPF" value={client.cpf ?? '—'} />
          <Field
            label="Código do cliente"
            value={
              <span className="font-mono text-xs">{client.client_code}</span>
            }
          />
          <Field label="Cadastro" value={fmtDateTime(client.created_at)} />
        </div>
      </section>

      {/* 2.2 — Endereço */}
      <SectionCard title="Endereço">
        {addressList.length === 0 && (
          <Empty text="Nenhum endereço cadastrado." />
        )}
        <div className="space-y-4">
          {addressList.map((a, i) => (
            <div
              key={a.id ?? i}
              className="flex items-start justify-between gap-4 border border-gray-100 rounded-xl p-4"
            >
              <div className="text-sm text-[#13244f]">
                <p>
                  {a.street}, {a.number}
                  {a.complement ? ` — ${a.complement}` : ''}
                </p>
                <p className="text-gray-500">
                  {a.neighborhood} — {a.city}/{a.state} — CEP {a.zip_code}
                </p>
              </div>
              {a.is_default && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 shrink-0">
                  Padrão
                </span>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 2.3 — Assinatura */}
      <SectionCard title="Assinatura">
        {subList.length === 0 && <Empty text="Nenhuma assinatura." />}
        <div className="space-y-4">
          {subList.map((sub) => (
            <div key={sub.id} className="border border-gray-100 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm font-bold text-[#13244f]">
                  {PLAN_LABELS[sub.plan_type] ?? sub.plan_type}
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${SUB_STATUS_BADGE[sub.status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {sub.status}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Iniciada em" value={fmtDate(sub.started_at)} />
                <Field label="Expira em" value={fmtDate(sub.expires_at)} />
                <Field
                  label="Próxima cobrança"
                  value={fmtDate(sub.next_billing_at)}
                />
                <Field
                  label="Pagar.me sub"
                  value={
                    sub.pagarme_sub_id ? (
                      <span className="font-mono text-xs">
                        {sub.pagarme_sub_id}
                      </span>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field
                  label="Tentativas de cobrança"
                  value={String(sub.retry_count ?? 0)}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 2.4 — Pedidos e entrega */}
      <SectionCard title="Pedidos e entrega">
        {orderList.length === 0 && <Empty text="Nenhum pedido." />}
        <div className="space-y-4">
          {orderList.map((order) => {
            const eventos = [...(order.shipping_json?.eventos ?? [])].sort(
              (a, b) => {
                const ta = a.datahora ? new Date(a.datahora).getTime() : 0
                const tb = b.datahora ? new Date(b.datahora).getTime() : 0
                return ta - tb
              },
            )
            const quote = order.shipping_quote_json
            return (
              <div
                key={order.id}
                className="border border-gray-100 rounded-xl p-4"
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${ORDER_STATUS_BADGE[order.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  {order.pharmacy_sent_at ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                      ✓ Enviado à farmácia em {fmtDate(order.pharmacy_sent_at)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                      Não enviado à farmácia
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-gray-300">
                    {order.id}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field
                    label="Valor total"
                    value={money(order.total_amount)}
                  />
                  <Field label="Data" value={fmtDateTime(order.created_at)} />
                  <Field
                    label="Rastreio"
                    value={
                      order.tracking_code ? (
                        <span className="font-mono text-xs">
                          {order.tracking_code}
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <Field
                    label="Frete"
                    value={
                      quote
                        ? [
                            quote.transportadora,
                            quote.nomeServico,
                            quote.tipo,
                            money(quote.valor),
                            quote.prazoDias != null
                              ? `${quote.prazoDias}d`
                              : null,
                            quote.codigoServico,
                            freightOrigin ? `origem ${freightOrigin}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : freightOrigin
                          ? `origem ${freightOrigin}`
                          : '—'
                    }
                  />
                </div>
                {eventos.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase mb-2">
                      Rastreamento
                    </p>
                    <ol className="space-y-1.5">
                      {eventos.map((ev, i) => (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: eventos vêm de um payload externo de rastreio sem id estável; a lista é somente leitura
                          key={i}
                          className="flex gap-3 text-xs text-gray-600"
                        >
                          <span className="shrink-0 text-gray-400 font-mono">
                            {fmtDateTime(ev.datahora)}
                          </span>
                          <span>
                            {ev.descricao ?? '—'}
                            {(ev.local || ev.cidade) && (
                              <span className="text-gray-400">
                                {' '}
                                —{' '}
                                {[ev.local, ev.cidade]
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            )}
                            {ev.finalizado === 1 && (
                              <span className="ml-1 text-green-700 font-bold">
                                ✓
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* 2.5 — Pagamentos */}
      <SectionCard title="Pagamentos">
        {paymentList.length === 0 && <Empty text="Nenhum pagamento." />}
        {paymentList.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                  Valor
                </th>
                <th className="text-left py-2 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                  Status
                </th>
                <th className="text-left py-2 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                  Data
                </th>
                <th className="text-left py-2 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                  Pagar.me charge
                </th>
              </tr>
            </thead>
            <tbody>
              {paymentList.map((p, i) => (
                <tr key={p.id ?? i} className="border-b border-gray-50">
                  <td className="py-2.5 font-semibold text-[#13244f]">
                    {money(p.amount)}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${PAYMENT_STATUS_BADGE[p.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-500 text-xs">
                    {fmtDateTime(p.paid_at ?? p.created_at)}
                  </td>
                  <td className="py-2.5 font-mono text-[11px] text-gray-400">
                    {p.pagarme_charge_id ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* 2.6 — Protocolo e prescrição */}
      <SectionCard title="Protocolo e prescrição">
        {protocolList.length === 0 && <Empty text="Nenhum protocolo." />}
        <div className="space-y-4">
          {protocolList.map((protocol) => (
            <div
              key={protocol.id}
              className="border border-gray-100 rounded-xl p-4"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${PROTOCOL_STATUS_BADGE[protocol.status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {PROTOCOL_STATUS_LABEL[protocol.status] ?? protocol.status}
                </span>
                {protocol.prescription_pdf_signed_url && (
                  <a
                    href={protocol.prescription_pdf_signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#13244f] bg-[#13244f]/5 hover:bg-[#13244f]/10 px-3 py-1.5 rounded-lg transition"
                  >
                    Ver PDF da prescrição
                  </a>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
                <Field
                  label="Gerado em"
                  value={fmtDateTime(protocol.generated_at)}
                />
                <Field
                  label="Assinado em"
                  value={fmtDateTime(protocol.signed_at)}
                />
                <Field
                  label="Assinado por"
                  value={professionalName(protocol.signed_by)}
                />
              </div>
              <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase mb-2">
                Itens
              </p>
              <ul className="space-y-1.5">
                {(protocol.protocol_items ?? []).map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 text-sm text-[#13244f]"
                  >
                    <span
                      className={
                        item.removed_by_patient
                          ? 'line-through text-gray-400'
                          : ''
                      }
                    >
                      {item.products?.name
                        ? getProductDisplayName(item.products.name)
                        : '—'}
                      {item.products?.name && (
                        <span className="text-gray-400 font-normal">
                          {' '}
                          ({item.products.name})
                        </span>
                      )}
                    </span>
                    {item.is_required && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#13244f]/10 text-[#13244f]">
                        obrigatório
                      </span>
                    )}
                    {item.removed_by_patient && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                        removido pelo paciente
                      </span>
                    )}
                    {item.activation_reason && (
                      <span className="text-xs text-gray-400">
                        · {item.activation_reason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 2.7 — Saúde */}
      <SectionCard title="Saúde">
        {quizList.length === 0 && healthList.length === 0 && (
          <Empty text="Nenhuma resposta de quiz ou registro de saúde." />
        )}
        <div className="space-y-4">
          {quizList.map((quiz, i) => (
            <div
              key={String(quiz.id ?? i)}
              className="border border-gray-100 rounded-xl p-4"
            >
              <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase mb-2">
                Resposta de quiz{' '}
                {quizList.length > 1 ? `#${quizList.length - i}` : ''}
              </p>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                {readableEntries(quiz).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <dt className="font-mono text-gray-400 shrink-0">{key}:</dt>
                    <dd className="text-[#13244f] break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {healthList.map((record, i) => (
            <div
              key={String(record.id ?? i)}
              className="border border-gray-100 rounded-xl p-4"
            >
              <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase mb-2">
                Registro de saúde{' '}
                {healthList.length > 1 ? `#${healthList.length - i}` : ''}
              </p>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                {readableEntries(record).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <dt className="font-mono text-gray-400 shrink-0">{key}:</dt>
                    <dd className="text-[#13244f] break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 2.8 — Comunicações e acesso */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Comunicações (últimas 20)">
          {notifList.length === 0 && (
            <Empty text="Nenhuma notificação registrada." />
          )}
          <ul className="space-y-2">
            {notifList.map((n, i) => (
              <li
                key={String(n.id ?? i)}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <span className="font-semibold text-[#13244f]">
                  {String(n.type ?? '—')}
                </span>
                <span className="text-gray-400">
                  via {String(n.channel ?? '—')}
                </span>
                <span
                  className={`font-bold px-2 py-0.5 rounded-full ${n.status === 'sent' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
                >
                  {String(n.status ?? '—')}
                </span>
                <span className="ml-auto text-gray-400">
                  {fmtDateTime(
                    n.sent_at
                      ? String(n.sent_at)
                      : n.created_at
                        ? String(n.created_at)
                        : null,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Acessos (últimos 20)">
          {loginList.length === 0 && <Empty text="Nenhum acesso registrado." />}
          <ul className="space-y-2">
            {loginList.map((l, i) => (
              <li key={String(l.id ?? i)} className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#13244f]">
                    {fmtDateTime(l.logged_at ? String(l.logged_at) : null)}
                  </span>
                  <span className="font-mono text-gray-400">
                    {String(l.ip_address ?? '—')}
                  </span>
                </div>
                <p className="text-gray-400 truncate mt-0.5">
                  {String(l.user_agent ?? '—')}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* 2.9 — Conformidade */}
      <SectionCard title="Conformidade — aceite dos Termos de Uso">
        {termsList.length === 0 && <Empty text="Nenhum aceite registrado." />}
        <div className="space-y-3">
          {termsList.map((t, i) => (
            <div
              key={t.id ?? i}
              className="border border-gray-100 rounded-xl p-4"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
                <Field label="Versão" value={t.terms_version} />
                <Field
                  label="Hash"
                  value={
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs">
                        {t.terms_hash.slice(0, 16)}…
                      </span>
                      <CopyButton value={t.terms_hash} label="Copiar hash" />
                    </span>
                  }
                />
                <Field
                  label="IP"
                  value={
                    t.ip_address ? (
                      <span className="font-mono text-xs">{t.ip_address}</span>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field label="Aceito em" value={fmtDateTime(t.accepted_at)} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </main>
  )
}
