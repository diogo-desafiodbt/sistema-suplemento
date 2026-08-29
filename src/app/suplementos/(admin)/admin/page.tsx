import Link from 'next/link'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { exigirAdmin } from '@/lib/auth/admin'
import { asNumber, getSql } from '@/lib/db'

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

export default async function AdminVisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  await exigirAdmin()

  const params = await searchParams
  const periodo: PeriodKey =
    params.periodo === '7' ||
    params.periodo === '90' ||
    params.periodo === 'all'
      ? params.periodo
      : '30'

  const since = periodo === 'all' ? null : daysAgoIso(parseInt(periodo, 10))

  const sqlCounts = getSql()
  const sinceFilter = (col: string) =>
    since
      ? sqlCounts`${sqlCounts(col)} >= ${since}::timestamptz`
      : sqlCounts`true`

  const countN = async (query: Promise<{ n: number }[]>) =>
    (await query)[0]?.n ?? 0

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
    countN(sqlCounts<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM funnel_events
      WHERE event_type = 'quiz_started' AND ${sinceFilter('created_at')}
    `),
    countN(sqlCounts<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM funnel_events
      WHERE event_type = 'quiz_eligible' AND ${sinceFilter('created_at')}
    `),
    countN(sqlCounts<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM funnel_events
      WHERE event_type = 'checkout_started' AND ${sinceFilter('created_at')}
    `),
    countN(sqlCounts<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM payments
      WHERE status = 'paid' AND ${sinceFilter('paid_at')}
    `),
    countN(sqlCounts<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM protocols
      WHERE status = 'signed' AND ${sinceFilter('signed_at')}
    `),
    countN(sqlCounts<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM orders
      WHERE pharmacy_sent_at IS NOT NULL AND ${sinceFilter('pharmacy_sent_at')}
    `),
    countN(sqlCounts<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM orders
      WHERE status = 'dispatched' AND ${sinceFilter('created_at')}
    `),
    countN(sqlCounts<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM orders
      WHERE status = 'delivered' AND ${sinceFilter('created_at')}
    `),
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

  // --- Alertas (consultas preservadas; UI deste passo é só o funil) ---
  const threeDaysAgo = daysAgoIso(3)
  const twoDaysAgo = daysAgoIso(2)
  const sevenDaysAgo = daysAgoIso(7)
  const oneDayAgo = daysAgoIso(1)
  const sql = getSql()

  const [stuckProtocolsRaw, stuckOrdersRaw, reconRows, failedPaymentsRaw] =
    await Promise.all([
      sql<
        {
          id: string
          user_id: string
          generated_at: string | Date
          users: { full_name: string } | null
        }[]
      >`
      SELECT p.id, p.user_id, p.generated_at,
        CASE WHEN u.id IS NULL THEN NULL
          ELSE jsonb_build_object('full_name', u.full_name) END AS users
      FROM protocols p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.status = 'pending_signature' AND p.generated_at < ${threeDaysAgo}::timestamptz
      ORDER BY p.generated_at ASC
      LIMIT 20
    `,
      sql<
        {
          id: string
          created_at: string | Date
          users: { full_name: string } | null
        }[]
      >`
      SELECT o.id, o.created_at,
        CASE WHEN u.id IS NULL THEN NULL
          ELSE jsonb_build_object('full_name', u.full_name) END AS users
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.pharmacy_sent_at IS NULL AND o.created_at < ${twoDaysAgo}::timestamptz
      ORDER BY o.created_at ASC
      LIMIT 20
    `,
      sql<
        {
          id: string
          status: string
          completed_at: string | Date | null
          started_at: string | Date | null
          payload: unknown
        }[]
      >`
      SELECT id, status, completed_at, started_at, payload
      FROM background_jobs
      WHERE job_type = 'pharmacy_reconciliation'
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 1
    `,
      sql<
        {
          id: string
          amount: string | number | null
          created_at: string | Date
          subscription_id: string | null
          subscriptions: {
            user_id: string
            users: { full_name: string } | null
          } | null
        }[]
      >`
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

  const stuckProtocols = stuckProtocolsRaw.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    generated_at:
      p.generated_at instanceof Date
        ? p.generated_at.toISOString()
        : String(p.generated_at),
    days: daysBetween(p.generated_at),
    patientName: p.users?.full_name ?? 'Paciente',
  }))

  const stuckOrders = stuckOrdersRaw.map((o) => ({
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

  const failedPayments = failedPaymentsRaw.map((p) => {
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

  const webhookCountRows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM webhook_logs
    WHERE processed = false AND received_at >= ${sevenDaysAgo}::timestamptz
  `
  const webhookCount = webhookCountRows[0]?.n ?? 0

  // Consultas acima preservadas (critério: sem diff SQL). UI = só o funil.
  void [
    stuckProtocols,
    stuckOrders,
    reconOk,
    reconAlertReason,
    latestRecon,
    reconAt,
    failedPayments,
    webhookCount,
    money,
  ]

  return (
    <div style={{ maxWidth: 896 }}>
      <CabecaDePagina
        trilha="Operação / Visão Geral"
        titulo="Visão Geral"
        acao={
          <div className="admin-periodo">
            {PERIOD_OPTIONS.map((opt) => (
              <Link
                key={opt.key}
                href={
                  opt.key === '30'
                    ? '/suplementos/admin'
                    : `/suplementos/admin?periodo=${opt.key}`
                }
                className={periodo === opt.key ? 'ativo' : undefined}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        }
      />

      <Card>
        <div style={{ marginBottom: 20 }}>
          <p className="admin-card-rotulo">Funil de conversão</p>
          <p className="admin-sub">
            Contagens absolutas e queda percentual entre etapas.
          </p>
        </div>

        <ol className="admin-funil">
          {funnel.map((step, i) => (
            <li key={step.key} className="admin-funil-item">
              <div className="admin-funil-eixo">
                <div className="admin-funil-ponto" />
                {i < funnel.length - 1 ? (
                  <div className="admin-funil-linha" />
                ) : null}
              </div>
              <div className="admin-funil-corpo">
                <span className="admin-funil-count">
                  {step.count.toLocaleString('pt-BR')}
                </span>
                <span className="admin-funil-label">{step.label}</span>
                {step.dropPct !== null ? (
                  <Selo
                    tom={
                      step.dropPct > 0
                        ? 'perigo'
                        : step.dropPct < 0
                          ? 'ok'
                          : 'neutro'
                    }
                  >
                    {step.dropPct > 0
                      ? `−${step.dropPct}% vs etapa anterior`
                      : step.dropPct < 0
                        ? `+${Math.abs(step.dropPct)}% vs etapa anterior`
                        : '0% vs etapa anterior'}
                  </Selo>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
