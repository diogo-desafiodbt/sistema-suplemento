import Link from 'next/link'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Botao } from '@/components/admin/ui/Botao'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { Tabela } from '@/components/admin/ui/Tabela'
import { Vazio } from '@/components/admin/ui/Vazio'
import { RFM_TIER_LABEL } from '@/lib/admin/rfm-tier'
import { exigirAdmin } from '@/lib/auth/admin'
import { asNumber, getSql } from '@/lib/db'

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

function tomTier(tier: string): 'ok' | 'atencao' | 'perigo' | 'neutro' {
  if (tier.startsWith('1_') || tier.startsWith('2_') || tier.startsWith('3_')) {
    return 'ok'
  }
  if (tier.startsWith('5_') || tier.startsWith('6_')) return 'atencao'
  if (tier.startsWith('7_')) return 'perigo'
  return 'neutro'
}

export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  await exigirAdmin()

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
    <div>
      <CabecaDePagina
        trilha="Clínico / Clientes"
        titulo="Clientes"
        acao={
          <span
            className="admin-num"
            style={{ color: 'var(--admin-tinta-fraca)', fontSize: 14 }}
          >
            {total} registros
          </span>
        }
      />

      <form
        method="GET"
        action="/suplementos/admin/clientes"
        className="admin-form-busca"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, e-mail, CPF ou código do cliente…"
          className="admin-input"
        />
        <Botao type="submit" variante="primario">
          Buscar
        </Botao>
        {q ? (
          <Link
            href="/suplementos/admin/clientes"
            className="admin-link-suave"
            style={{ alignSelf: 'center' }}
          >
            Limpar
          </Link>
        ) : null}
      </form>

      <Card className="!p-0 overflow-hidden">
        {clientList.length === 0 ? (
          <Vazio
            titulo={
              q ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'
            }
            explicacao={
              q
                ? `A busca por “${q}” não retornou ninguém. Confira o nome, e-mail, CPF ou código e tente de novo.`
                : 'Quando houver cadastros, a lista aparece aqui com tier RFM e atalho para a visão 360°.'
            }
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Código</th>
                <th>Tier RFM</th>
                <th>Cadastro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clientList.map((u) => {
                const tier = tierOf(u)
                return (
                  <tr key={u.id}>
                    <td>
                      <p className="admin-nome">{u.full_name}</p>
                      <p className="admin-sub">{u.email}</p>
                    </td>
                    <td className="admin-mono admin-num">{u.client_code}</td>
                    <td>
                      {tier ? (
                        <Selo tom={tomTier(tier)}>
                          {RFM_TIER_LABEL[tier] ?? tier}
                        </Selo>
                      ) : (
                        <span className="admin-sub">—</span>
                      )}
                    </td>
                    <td className="admin-num admin-sub">
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/suplementos/admin/clientes/${u.id}`}
                        className="admin-link-suave"
                      >
                        Ver 360°
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        )}
      </Card>

      {totalPages > 1 ? (
        <div className="admin-paginacao">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="admin-btn admin-btn--secundario"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="admin-num">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="admin-btn admin-btn--secundario"
            >
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  )
}
