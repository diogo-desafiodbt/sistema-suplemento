import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RFM_TIER_BADGE, RFM_TIER_LABEL } from '@/lib/admin/rfm-tier'
import { getUserProfile } from '@/lib/auth/profile'
import { asNumber, getSql } from '@/lib/db'
import { sessaoAtual } from '@/lib/auth/sessao'

const PAGE_SIZE = 20

type ClientRow = {
  id: string
  full_name: string
  email: string
  cpf: string | null
  client_code: string
  created_at: string
  user_rfm_scores: { tier: string } | { tier: string }[] | null
}

function tierOf(row: ClientRow): string | null {
  const rfm = row.user_rfm_scores
  if (!rfm) return null
  if (Array.isArray(rfm)) return rfm[0]?.tier ?? null
  return rfm.tier
}

export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/suplementos/login')

  const profile = await getUserProfile(sessao.userId)

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const params = await searchParams
  const q = (params.q ?? '').trim()
  const search = q ? q.replace(/[%_]/g, '') : null
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE

  const sql = getSql()
  const rows = await sql<(ClientRow & { total: string | number })[]>`
    SELECT u.id, u.full_name, u.email, u.cpf, u.client_code, u.created_at,
      COALESCE(rfm.list, '[]'::jsonb) AS user_rfm_scores,
      COUNT(*) OVER() AS total
    FROM users u
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('tier', r.tier) ORDER BY r.user_id) AS list
      FROM user_rfm_scores r WHERE r.user_id = u.id) rfm ON true
    WHERE (
      ${search}::text IS NULL
      OR u.full_name ILIKE '%' || ${search} || '%'
      OR u.email ILIKE '%' || ${search} || '%'
      OR u.cpf ILIKE '%' || ${search} || '%'
      OR u.client_code ILIKE '%' || ${search} || '%'
    )
    ORDER BY u.created_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${from}
  `

  const clientList: ClientRow[] = rows.map(({ total: _total, ...row }) => row)
  const total = rows[0] ? asNumber(rows[0].total) : 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function pageHref(p: number) {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    return qs
      ? `/suplementos/admin/clientes?${qs}`
      : '/suplementos/admin/clientes'
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
            Gestão
          </p>
          <h1 className="text-2xl font-bold text-[#13244f]">Clientes</h1>
        </div>
        <span className="text-sm text-gray-400">{total} registros</span>
      </div>

      <form
        method="GET"
        action="/suplementos/admin/clientes"
        className="mb-6 flex gap-3"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, e-mail, CPF ou código do cliente…"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-[#13244f] focus:ring-1 focus:ring-[#13244f] placeholder-gray-400"
        />
        <button
          type="submit"
          className="bg-[#13244f] hover:bg-[#0d1a3a] text-white px-6 rounded-xl text-sm font-bold transition"
        >
          Buscar
        </button>
        {q && (
          <Link
            href="/suplementos/admin/clientes"
            className="flex items-center px-4 rounded-xl text-sm text-[#13244f]/60 hover:bg-[#13244f]/10 transition"
          >
            Limpar
          </Link>
        )}
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Cliente
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Código
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Tier RFM
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
                Cadastro
              </th>
              <th className="text-left px-5 py-3.5 text-xs font-bold tracking-widest text-[#13244f]/50 uppercase"></th>
            </tr>
          </thead>
          <tbody>
            {clientList.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-gray-400 text-sm"
                >
                  {q
                    ? `Nenhum cliente encontrado para “${q}”.`
                    : 'Nenhum cliente cadastrado.'}
                </td>
              </tr>
            )}
            {clientList.map((u) => {
              const tier = tierOf(u)
              return (
                <tr
                  key={u.id}
                  className="border-b border-gray-50 hover:bg-[#f5f0eb]/50 transition-colors"
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[#13244f]">
                      {u.full_name}
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5">{u.email}</p>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-400">
                    {u.client_code}
                  </td>
                  <td className="px-5 py-4">
                    {tier ? (
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${RFM_TIER_BADGE[tier] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {RFM_TIER_LABEL[tier] ?? tier}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/suplementos/admin/clientes/${u.id}`}
                      className="inline-flex text-xs font-bold text-[#13244f] bg-[#13244f]/5 hover:bg-[#13244f]/10 px-3 py-1.5 rounded-lg transition"
                    >
                      Ver 360°
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="text-sm font-semibold text-[#13244f] bg-white border border-gray-200 px-4 py-2 rounded-xl hover:bg-[#13244f]/5 transition"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-gray-400">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="text-sm font-semibold text-[#13244f] bg-white border border-gray-200 px-4 py-2 rounded-xl hover:bg-[#13244f]/5 transition"
            >
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </main>
  )
}
