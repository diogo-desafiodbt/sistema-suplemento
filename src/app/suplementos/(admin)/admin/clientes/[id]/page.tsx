import { exigirAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CopyButton } from '@/components/CopyButton'
import { RFM_TIER_LABEL, RFM_TIER_TOM } from '@/lib/admin/rfm-tier'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import {
  buscarComprasHotmartPorEmail,
  formatarValorCompra,
  montarComprasUnificadas,
  type HotmartSaleRow,
} from '@/lib/admin/compras-cliente'
import { asNumber, getSql } from '@/lib/db'
import { createPrescriptionPdfSignedUrl } from '@/lib/pdf/signed-url'
import { PLAN_LABELS } from '@/lib/plans'
import { getProductDisplayName } from '@/lib/product-display-names'
import { isNorteNordeste } from '@/lib/shipping/sender-region'

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
  order_items?: Array<{ products: { name: string } | null }>
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
  conselho: string | null
  users: { full_name: string } | null
}

type TermsRow = {
  id?: string
  terms_version: string
  terms_hash: string
  ip_address: string | null
  accepted_at: string
}

/**
 * Tom do selo, nao classe de cor. A ficha tinha seis mapas de cor Tailwind,
 * cada um inventando a propria escala: `bg-orange-50` para um estado,
 * `bg-amber-50` para outro que quer dizer a mesma coisa. Agora sao quatro
 * tons semanticos, e a cor mora no `admin.css` com o resto.
 */
const SUB_STATUS_TOM: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  active: 'ok',
  past_due: 'atencao',
  grace_period: 'atencao',
  canceled: 'neutro',
  expired: 'perigo',
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando',
  sent_to_pharmacy: 'Na farmácia',
  dispatched: 'A caminho',
  delivered: 'Entregue',
  failed: 'Falhou',
}

const ORDER_STATUS_TOM: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  pending: 'neutro',
  sent_to_pharmacy: 'neutro',
  dispatched: 'atencao',
  delivered: 'ok',
  failed: 'perigo',
}

const PAYMENT_STATUS_TOM: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  paid: 'ok',
  pending: 'atencao',
  failed: 'perigo',
}

const COMPRA_ORIGEM_TOM: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  guia: 'atencao',
  suplemento: 'neutro',
}

const COMPRA_STATUS_TOM: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  Pago: 'ok',
  Aguardando: 'neutro',
  'Na farmácia': 'neutro',
  'A caminho': 'atencao',
  Entregue: 'ok',
  Falhou: 'perigo',
}

const PROTOCOL_STATUS_LABEL: Record<string, string> = {
  pending_signature: 'Aguardando assinatura',
  signed: 'Assinado',
  rejected: 'Rejeitado',
}

const PROTOCOL_STATUS_TOM: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  pending_signature: 'atencao',
  signed: 'ok',
  rejected: 'perigo',
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
  return <Card rotulo={title}>{children}</Card>
}

function Empty({ text }: { text: string }) {
  return <p className="admin-vazio-texto">{text}</p>
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="admin-campo-rotulo">{label}</p>
      <p className="admin-campo-valor">{value ?? '—'}</p>
    </div>
  )
}

export default async function AdminClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirAdmin()

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
      SELECT o.id, o.status, o.created_at, o.total_amount, o.tracking_code,
             o.pharmacy_sent_at, o.shipping_quote_json, o.shipping_json,
        COALESCE(it.list, '[]'::jsonb) AS order_items
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'products', CASE WHEN pr.id IS NULL THEN NULL
            ELSE jsonb_build_object('name', pr.name) END
        ) ORDER BY oi.id) AS list
        FROM order_items oi LEFT JOIN products pr ON pr.id = oi.product_id
        WHERE oi.order_id = o.id
      ) it ON true
      WHERE o.user_id = ${id}::uuid
      ORDER BY o.created_at DESC
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

  let hotmartErro: string | null = null
  let hotmartCompras: HotmartSaleRow[] = []
  try {
    hotmartCompras = await buscarComprasHotmartPorEmail(client.email)
  } catch (error) {
    console.error('ficha cliente: hotmart_sales indisponível', error)
    hotmartErro =
      'O histórico de compras do guia (Hotmart) não pôde ser carregado. O restante da ficha continua disponível.'
  }

  const comprasUnificadas = montarComprasUnificadas(hotmartCompras, orderList)

  const protocolList = await Promise.all(
    protocols.map(async (p) => ({
      ...p,
      prescription_pdf_signed_url: await createPrescriptionPdfSignedUrl(
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
          SELECT pf.id, pf.crm, pf.crm_state, pf.conselho,
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
      ? ` — ${pro.conselho ?? 'CRM'} ${pro.crm}${pro.crm_state ? `/${pro.crm_state}` : ''}`
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
    <main className="admin-pilha">
      <Link href="/suplementos/admin/clientes" className="admin-voltar">
        ← Voltar para clientes
      </Link>

      {/* 2.1 — Cabeçalho */}
      <CabecaDePagina
        trilha="Clientes"
        titulo={client.full_name}
        acao={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Selo tom="neutro">{client.role}</Selo>
            {tier ? (
              <Selo tom={RFM_TIER_TOM[tier] ?? 'neutro'}>
                {RFM_TIER_LABEL[tier] ?? tier}
              </Selo>
            ) : null}
          </div>
        }
      />

      <section className="admin-card">
        <div className="admin-campos">
          <Field label="E-mail" value={client.email} />
          <Field label="Telefone" value={client.phone ?? '—'} />
          <Field label="CPF" value={client.cpf ?? '—'} />
          <Field
            label="Código do cliente"
            value={
              <span className="admin-mono">{client.client_code}</span>
            }
          />
          <Field label="Cadastro" value={fmtDateTime(client.created_at)} />
        </div>
      </section>

      {/* Compras — visão unificada (Hotmart + sistema) */}
      <SectionCard title="Compras">
        {hotmartErro ? (
          <p className="admin-aviso">
            {hotmartErro}
          </p>
        ) : null}
        {comprasUnificadas.length === 0 ? (
          <Empty
            text={
              hotmartErro
                ? 'Nenhuma compra de suplemento no sistema.'
                : 'Nenhuma compra registrada.'
            }
          />
        ) : (
          <ul className="admin-lista-itens">
            {comprasUnificadas.map((compra, i) => (
              <li
                key={`${compra.origem}-${compra.detalhe ?? compra.produto}-${i}`}
                className="admin-item"
              >
                <div className="admin-linha-item">
                  <span
                    className={`admin-selo admin-selo--${COMPRA_ORIGEM_TOM[compra.origem] ?? 'neutro'}`}
                  >
                    {compra.origemLabel}
                  </span>
                  <span
                    className={`admin-selo admin-selo--${COMPRA_STATUS_TOM[compra.statusLabel] ?? 'neutro'}`}
                    title={compra.statusBruto || undefined}
                  >
                    {compra.statusLabel}
                  </span>
                  <span className="admin-empurra admin-sub">
                    {fmtDateTime(compra.data)}
                  </span>
                </div>
                <p className="admin-nome">
                  {compra.produto}
                </p>
                <div className="admin-linha-item admin-sub" style={{ marginTop: 8, marginBottom: 0, columnGap: 16, rowGap: 4 }}>
                  <span>
                    Valor:{' '}
                    <strong style={{ color: 'var(--admin-tinta)' }}>
                      {formatarValorCompra(compra.valor, compra.moeda)}
                    </strong>
                  </span>
                  {compra.detalhe ? (
                    <span className="admin-mono">
                      {compra.detalhe}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 2.2 — Endereço */}
      <SectionCard title="Endereço">
        {addressList.length === 0 && (
          <Empty text="Nenhum endereço cadastrado." />
        )}
        <div className="admin-pilha">
          {addressList.map((a, i) => (
            <div
              key={a.id ?? i}
              className="admin-item" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}
            >
              <div className="admin-campo-valor">
                <p>
                  {a.street}, {a.number}
                  {a.complement ? ` — ${a.complement}` : ''}
                </p>
                <p className="admin-sub">
                  {a.neighborhood} — {a.city}/{a.state} — CEP {a.zip_code}
                </p>
              </div>
              {a.is_default && (
                <span className="admin-selo admin-selo--ok" style={{ flexShrink: 0 }}>
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
        <div className="admin-pilha">
          {subList.map((sub) => (
            <div key={sub.id} className="admin-item">
              <div className="admin-linha-item">
                <span className="admin-nome">
                  {PLAN_LABELS[sub.plan_type] ?? sub.plan_type}
                </span>
                <span
                  className={`admin-selo admin-selo--${SUB_STATUS_TOM[sub.status] ?? 'neutro'}`}
                >
                  {sub.status}
                </span>
              </div>
              <div className="admin-campos">
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
                      <span className="admin-mono">
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
        <div className="admin-pilha">
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
                className="admin-item"
              >
                <div className="admin-linha-item">
                  <span
                    className={`admin-selo admin-selo--${ORDER_STATUS_TOM[order.status] ?? 'neutro'}`}
                  >
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  {order.pharmacy_sent_at ? (
                    <span className="admin-selo admin-selo--neutro">
                      ✓ Enviado à farmácia em {fmtDate(order.pharmacy_sent_at)}
                    </span>
                  ) : (
                    <span className="admin-selo admin-selo--neutro">
                      Não enviado à farmácia
                    </span>
                  )}
                  <span className="admin-empurra admin-mono">
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
                        <span className="admin-mono">
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
                  <div style={{ marginTop: 16, borderTop: '1px solid var(--admin-borda-fraca)', paddingTop: 12 }}>
                    <p className="admin-campo-rotulo" style={{ marginBottom: 8 }}>
                      Rastreamento
                    </p>
                    <ol className="space-y-1.5">
                      {eventos.map((ev, i) => (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: eventos vêm de um payload externo de rastreio sem id estável; a lista é somente leitura
                          key={i}
                          className="admin-sub" style={{ display: 'flex', gap: 12, margin: 0 }}
                        >
                          <span className="admin-mono" style={{ flexShrink: 0 }}>
                            {fmtDateTime(ev.datahora)}
                          </span>
                          <span>
                            {ev.descricao ?? '—'}
                            {(ev.local || ev.cidade) && (
                              <span className="admin-sub">
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
              <tr style={{ borderBottom: '1px solid var(--admin-borda-fraca)' }}>
                <th className="admin-campo-rotulo" style={{ textAlign: 'left', paddingBottom: 8 }}>
                  Valor
                </th>
                <th className="admin-campo-rotulo" style={{ textAlign: 'left', paddingBottom: 8 }}>
                  Status
                </th>
                <th className="admin-campo-rotulo" style={{ textAlign: 'left', paddingBottom: 8 }}>
                  Data
                </th>
                <th className="admin-campo-rotulo" style={{ textAlign: 'left', paddingBottom: 8 }}>
                  Pagar.me charge
                </th>
              </tr>
            </thead>
            <tbody>
              {paymentList.map((p, i) => (
                <tr key={p.id ?? i} style={{ borderTop: '1px solid var(--admin-borda-fraca)' }}>
                  <td className="admin-nome" style={{ padding: '10px 0' }}>
                    {money(p.amount)}
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <span
                      className={`admin-selo admin-selo--${PAYMENT_STATUS_TOM[p.status] ?? 'neutro'}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="admin-sub" style={{ padding: '10px 0' }}>
                    {fmtDateTime(p.paid_at ?? p.created_at)}
                  </td>
                  <td className="admin-mono" style={{ padding: '10px 0' }}>
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
        <div className="admin-pilha">
          {protocolList.map((protocol) => (
            <div
              key={protocol.id}
              className="admin-item"
            >
              <div className="admin-linha-item">
                <span
                  className={`admin-selo admin-selo--${PROTOCOL_STATUS_TOM[protocol.status] ?? 'neutro'}`}
                >
                  {PROTOCOL_STATUS_LABEL[protocol.status] ?? protocol.status}
                </span>
                {protocol.prescription_pdf_signed_url && (
                  <a
                    href={protocol.prescription_pdf_signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-btn admin-btn--secundario"
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
              <p className="admin-campo-rotulo" style={{ marginBottom: 8 }}>
                Itens
              </p>
              <ul className="space-y-1.5">
                {(protocol.protocol_items ?? []).map((item) => (
                  <li
                    key={item.id}
                    className="admin-linha-item"
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
                        <span className="admin-sub">
                          {' '}
                          ({item.products.name})
                        </span>
                      )}
                    </span>
                    {item.is_required && (
                      <span className="admin-selo admin-selo--neutro">
                        obrigatório
                      </span>
                    )}
                    {item.removed_by_patient && (
                      <span className="admin-selo admin-selo--perigo">
                        removido pelo paciente
                      </span>
                    )}
                    {item.activation_reason && (
                      <span className="admin-sub">
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
        <div className="admin-pilha">
          {quizList.map((quiz, i) => (
            <div
              key={String(quiz.id ?? i)}
              className="admin-item"
            >
              <p className="admin-campo-rotulo" style={{ marginBottom: 8 }}>
                Resposta de quiz{' '}
                {quizList.length > 1 ? `#${quizList.length - i}` : ''}
              </p>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                {readableEntries(quiz).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <dt className="admin-mono" style={{ flexShrink: 0 }}>{key}:</dt>
                    <dd className="admin-campo-valor">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {healthList.map((record, i) => (
            <div
              key={String(record.id ?? i)}
              className="admin-item"
            >
              <p className="admin-campo-rotulo" style={{ marginBottom: 8 }}>
                Registro de saúde{' '}
                {healthList.length > 1 ? `#${healthList.length - i}` : ''}
              </p>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                {readableEntries(record).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <dt className="admin-mono" style={{ flexShrink: 0 }}>{key}:</dt>
                    <dd className="admin-campo-valor">{value}</dd>
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
                <span className="admin-nome">
                  {String(n.type ?? '—')}
                </span>
                <span className="admin-sub">
                  via {String(n.channel ?? '—')}
                </span>
                <span
                  className={`admin-selo admin-selo--${n.status === 'sent' ? 'ok' : 'perigo'}`}
                >
                  {String(n.status ?? '—')}
                </span>
                <span className="admin-empurra admin-sub">
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
                  <span className="admin-nome">
                    {fmtDateTime(l.logged_at ? String(l.logged_at) : null)}
                  </span>
                  <span className="admin-mono">
                    {String(l.ip_address ?? '—')}
                  </span>
                </div>
                <p className="admin-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <div className="admin-lista-itens">
          {termsList.map((t, i) => (
            <div
              key={t.id ?? i}
              className="admin-item"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
                <Field label="Versão" value={t.terms_version} />
                <Field
                  label="Hash"
                  value={
                    <span className="flex items-center gap-2">
                      <span className="admin-mono">
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
                      <span className="admin-mono">{t.ip_address}</span>
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
