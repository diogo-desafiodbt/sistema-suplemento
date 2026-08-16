import Link from 'next/link'
import { redirect } from 'next/navigation'
import { asNumber, getSql } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type PeriodKey = '7' | '30' | '90' | 'all'

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' },
  { key: '90', label: '90 dias' },
  { key: 'all', label: 'Tudo' },
]

type FunnelStep = {
  key: string
  label: string
  count: number
  dropPct: number | null
}

type StuckProtocol = {
  id: string
  user_id: string
  generated_at: string
  days: number
  patientName: string
}

type StuckOrder = {
  id: string
  created_at: string
  days: number
  patientName: string
}

type FailedPayment = {
  id: string
  amount: number | null
  created_at: string
  clientHref: string | null
  patientName: string
}

// O client admin não usa os tipos gerados do Database (createAdminClient não
// passa o generic), então o builder do Supabase acaba com generics profundos
// demais pra compor via callback sem estourar "type instantiation is
// excessively deep" do TS. `any` aqui é a via de escape deliberada — mantém
// runtime seguro (filtros são só .eq/.gte/.not encadeados) sem tentar
// recriar os tipos do postgrest-js.
async function countRows(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query builder genérico sem Database tipado
  filters: (q: any) => any,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem
  let query: any = admin
    .from(table)
    .select('id', { count: 'exact', head: true })
  query = filters(query)
  const { count } = await query
  return count ?? 0
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function daysBetween(fromIso: string | Date): number {
  return Math.floor(
    (Date.now() - new Date(fromIso).getTime()) / (1000 * 60 * 60 * 24),
  )
}

function money(value: number | null | undefined): string {
  return `R$ ${(value ?? 0).toFixed(2).replace('.', ',')}`
}

function AlertCard({
  title,
  ok,
  children,
}: {
  title: string
  ok: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={`rounded-2xl border shadow-sm p-5 ${
        ok
          ? 'bg-white border-gray-100'
          : 'bg-white border-amber-200 ring-1 ring-amber-100'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
          {title}
        </p>
        {ok ? (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700">
            Tudo certo
          </span>
        ) : (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
            Atenção
          </span>
        )}
      </div>
      {ok ? (
        <p className="text-sm text-gray-400">Tudo certo por aqui.</p>
      ) : (
        children
      )}
    </section>
  )
}

export default async function AdminVisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/suplementos/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const params = await searchParams
  const periodo: PeriodKey =
    params.periodo === '7' ||
    params.periodo === '90' ||
    params.periodo === 'all'
      ? params.periodo
      : '30'

  const since = periodo === 'all' ? null : daysAgoIso(parseInt(periodo, 10))

  const [
    quizStarted,
    quizCompleted,
    checkoutStarted,
    paymentConfirmed,
    prescriptionSigned,
    sentToPharmacy,
    dispatched,
    delivered,
  ] = await Promise.all([
    countRows(admin, 'funnel_events', (q) => {
      let next = q.eq('event_type', 'quiz_started')
      if (since) next = next.gte('created_at', since)
      return next
    }),
    countRows(admin, 'funnel_events', (q) => {
      let next = q.eq('event_type', 'quiz_eligible')
      if (since) next = next.gte('created_at', since)
      return next
    }),
    countRows(admin, 'funnel_events', (q) => {
      let next = q.eq('event_type', 'checkout_started')
      if (since) next = next.gte('created_at', since)
      return next
    }),
    countRows(admin, 'payments', (q) => {
      let next = q.eq('status', 'paid')
      if (since) next = next.gte('paid_at', since)
      return next
    }),
    countRows(admin, 'protocols', (q) => {
      let next = q.eq('status', 'signed')
      if (since) next = next.gte('signed_at', since)
      return next
    }),
    countRows(admin, 'orders', (q) => {
      let next = q.not('pharmacy_sent_at', 'is', null)
      if (since) next = next.gte('pharmacy_sent_at', since)
      return next
    }),
    countRows(admin, 'orders', (q) => {
      let next = q.eq('status', 'dispatched')
      if (since) next = next.gte('created_at', since)
      return next
    }),
    countRows(admin, 'orders', (q) => {
      let next = q.eq('status', 'delivered')
      if (since) next = next.gte('created_at', since)
      return next
    }),
  ])

  const rawSteps = [
    { key: 'quiz_started', label: 'Quiz iniciado', count: quizStarted },
    { key: 'quiz_completed', label: 'Quiz apto', count: quizCompleted },
    { key: 'checkout', label: 'Checkout iniciado', count: checkoutStarted },
    { key: 'paid', label: 'Pagamento confirmado', count: paymentConfirmed },
    { key: 'signed', label: 'Prescrição assinada', count: prescriptionSigned },
    { key: 'pharmacy', label: 'Enviado à farmácia', count: sentToPharmacy },
    { key: 'dispatched', label: 'Despachado', count: dispatched },
    { key: 'delivered', label: 'Entregue', count: delivered },
  ]

  const funnel: FunnelStep[] = rawSteps.map((step, i) => {
    if (i === 0) return { ...step, dropPct: null }
    const prev = rawSteps[i - 1].count
    const dropPct =
      prev === 0 ? null : Math.round(((prev - step.count) / prev) * 100)
    return { ...step, dropPct }
  })

  // --- Alertas ---
  const threeDaysAgo = daysAgoIso(3)
  const twoDaysAgo = daysAgoIso(2)
  const sevenDaysAgo = daysAgoIso(7)
  const oneDayAgo = daysAgoIso(1)
  const sql = getSql()

  const [
    stuckProtocolsRaw,
    stuckOrdersRaw,
    reconRows,
    failedPaymentsRaw,
  ] = await Promise.all([
    sql<{
      id: string
      user_id: string
      generated_at: string | Date
      users: { full_name: string } | null
    }[]>`
      SELECT p.id, p.user_id, p.generated_at,
        CASE WHEN u.id IS NULL THEN NULL
          ELSE jsonb_build_object('full_name', u.full_name) END AS users
      FROM protocols p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.status = 'pending_signature' AND p.generated_at < ${threeDaysAgo}::timestamptz
      ORDER BY p.generated_at ASC
      LIMIT 20
    `,
    sql<{
      id: string
      created_at: string | Date
      users: { full_name: string } | null
    }[]>`
      SELECT o.id, o.created_at,
        CASE WHEN u.id IS NULL THEN NULL
          ELSE jsonb_build_object('full_name', u.full_name) END AS users
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.pharmacy_sent_at IS NULL AND o.created_at < ${twoDaysAgo}::timestamptz
      ORDER BY o.created_at ASC
      LIMIT 20
    `,
    sql<{
      id: string
      status: string
      completed_at: string | Date | null
      started_at: string | Date | null
      payload: unknown
    }[]>`
      SELECT id, status, completed_at, started_at, payload
      FROM background_jobs
      WHERE job_type = 'pharmacy_reconciliation'
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 1
    `,
    sql<{
      id: string
      amount: string | number | null
      created_at: string | Date
      subscription_id: string | null
      subscriptions: {
        user_id: string
        users: { full_name: string } | null
      } | null
    }[]>`
      SELECT pay.id, pay.amount, pay.created_at, pay.subscription_id,
        CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
          'user_id', s.user_id,
          'users', CASE WHEN u.id IS NULL THEN NULL
            ELSE jsonb_build_object('full_name', u.full_name) END) END AS subscriptions
      FROM payments pay
      LEFT JOIN subscriptions s ON s.id = pay.subscription_id
      LEFT JOIN users u ON u.id = s.user_id
      WHERE pay.status = 'failed' AND pay.created_at >= ${sevenDaysAgo}::timestamptz
      ORDER BY pay.created_at DESC
      LIMIT 20
    `,
  ])

  const stuckProtocols: StuckProtocol[] = stuckProtocolsRaw.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    generated_at:
      p.generated_at instanceof Date
        ? p.generated_at.toISOString()
        : String(p.generated_at),
    days: daysBetween(p.generated_at),
    patientName: p.users?.full_name ?? 'Paciente',
  }))

  const stuckOrders: StuckOrder[] = stuckOrdersRaw.map((o) => ({
    id: o.id,
    created_at:
      o.created_at instanceof Date
        ? o.created_at.toISOString()
        : String(o.created_at),
    days: daysBetween(o.created_at),
    patientName: o.users?.full_name ?? 'Paciente',
  }))

  const latestRecon = reconRows[0] ?? null

  const reconAt = latestRecon?.completed_at ?? latestRecon?.started_at ?? null
  const reconFresh = reconAt
    ? new Date(reconAt).getTime() >= new Date(oneDayAgo).getTime()
    : false
  const reconOk =
    !!latestRecon && latestRecon.status === 'completed' && reconFresh
  const reconAlertReason = !latestRecon
    ? 'Nenhuma reconciliação registrada ainda.'
    : latestRecon.status === 'failed'
      ? 'Última reconciliação falhou.'
      : !reconFresh
        ? 'Nenhuma reconciliação nas últimas 24h.'
        : null

  const failedPayments: FailedPayment[] = failedPaymentsRaw.map((p) => {
    const sub = p.subscriptions
    return {
      id: p.id,
      amount: p.amount == null ? null : asNumber(p.amount),
      created_at:
        p.created_at instanceof Date
          ? p.created_at.toISOString()
          : String(p.created_at),
      clientHref: sub?.user_id
        ? `/suplementos/admin/clientes/${sub.user_id}`
        : null,
      patientName: sub?.users?.full_name ?? 'Cliente',
    }
  })

  const { count: unprocessedWebhooks } = await admin
    .from('webhook_logs')
    .select('id', { count: 'exact', head: true })
    .eq('processed', false)
    .gte('created_at', sevenDaysAgo)

  const webhookCount = unprocessedWebhooks ?? 0

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div>
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
          Operação
        </p>
        <h1 className="text-2xl font-bold text-[#13244f]">Visão Geral</h1>
      </div>

      {/* Funil */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
              Funil de conversão
            </p>
            <p className="text-sm text-gray-400">
              Contagens absolutas e queda percentual entre etapas.
            </p>
          </div>
          <div className="flex gap-1 bg-[#f5f0eb] rounded-xl p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <Link
                key={opt.key}
                href={
                  opt.key === '30'
                    ? '/suplementos/admin'
                    : `/suplementos/admin?periodo=${opt.key}`
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  periodo === opt.key
                    ? 'bg-[#13244f] text-white'
                    : 'text-[#13244f]/60 hover:text-[#13244f]'
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>

        <ol className="space-y-0">
          {funnel.map((step, i) => (
            <li key={step.key} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-[#13244f] mt-2 shrink-0" />
                {i < funnel.length - 1 && (
                  <div className="w-px flex-1 bg-[#13244f]/15 my-1" />
                )}
              </div>
              <div
                className={`flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 ${i < funnel.length - 1 ? 'pb-5' : ''}`}
              >
                <span className="text-3xl font-bold text-[#13244f] tabular-nums leading-none">
                  {step.count.toLocaleString('pt-BR')}
                </span>
                <span className="text-sm font-semibold text-[#13244f]">
                  {step.label}
                </span>
                {step.dropPct !== null && (
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      step.dropPct > 0
                        ? 'bg-red-50 text-red-700'
                        : step.dropPct < 0
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {step.dropPct > 0
                      ? `−${step.dropPct}% vs etapa anterior`
                      : step.dropPct < 0
                        ? `+${Math.abs(step.dropPct)}% vs etapa anterior`
                        : '0% vs etapa anterior'}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Alertas */}
      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
            Alertas operacionais
          </p>
          <p className="text-sm text-gray-400">
            O que precisa de ação humana agora.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AlertCard
            title="Protocolos parados (>3 dias)"
            ok={stuckProtocols.length === 0}
          >
            <ul className="space-y-2">
              {stuckProtocols.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <Link
                    href={`/suplementos/admin/clientes/${p.user_id}`}
                    className="font-semibold text-[#13244f] hover:underline"
                  >
                    {p.patientName}
                  </Link>
                  <span className="text-xs text-amber-700 font-bold shrink-0">
                    há {p.days} dia{p.days === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </AlertCard>

          <AlertCard
            title="Pedidos sem envio à farmácia (>2 dias)"
            ok={stuckOrders.length === 0}
          >
            <ul className="space-y-2">
              {stuckOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <Link
                    href="/suplementos/admin/pedidos"
                    className="font-semibold text-[#13244f] hover:underline"
                  >
                    {o.patientName}
                  </Link>
                  <span className="text-xs text-amber-700 font-bold shrink-0">
                    há {o.days} dia{o.days === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/suplementos/admin/pedidos"
              className="inline-block mt-3 text-xs font-bold text-[#13244f] bg-[#13244f]/5 hover:bg-[#13244f]/10 px-3 py-1.5 rounded-lg transition"
            >
              Ir para pedidos
            </Link>
          </AlertCard>

          <AlertCard title="Reconciliação da farmácia" ok={reconOk}>
            <p className="text-sm text-[#13244f] font-semibold mb-1">
              {reconAlertReason}
            </p>
            {latestRecon && (
              <p className="text-xs text-gray-400">
                Último registro: {latestRecon.status}
                {reconAt
                  ? ` · ${new Date(reconAt).toLocaleString('pt-BR')}`
                  : ''}
              </p>
            )}
          </AlertCard>

          <AlertCard
            title="Pagamentos falhados (7 dias)"
            ok={failedPayments.length === 0}
          >
            <ul className="space-y-2">
              {failedPayments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  {p.clientHref ? (
                    <Link
                      href={p.clientHref}
                      className="font-semibold text-[#13244f] hover:underline"
                    >
                      {p.patientName}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[#13244f]">
                      {p.patientName}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 shrink-0">
                    {money(p.amount)} ·{' '}
                    {new Date(p.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          </AlertCard>

          <AlertCard
            title="Webhooks não processados (7 dias)"
            ok={webhookCount === 0}
          >
            <p className="text-sm text-[#13244f]">
              <span className="text-2xl font-bold tabular-nums">
                {webhookCount}
              </span>{' '}
              webhook{webhookCount === 1 ? '' : 's'} com{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">
                processed = false
              </code>
            </p>
          </AlertCard>
        </div>
      </section>
    </main>
  )
}
