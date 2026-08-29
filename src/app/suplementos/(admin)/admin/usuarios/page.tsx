import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { Tabela } from '@/components/admin/ui/Tabela'
import { Vazio } from '@/components/admin/ui/Vazio'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import { sessaoAtual } from '@/lib/auth/sessao'

type UserRow = {
  id: string
  full_name: string
  email: string
  client_code: string
  role: string
  created_at: string
  user_entitlements: { product_key: string; status: string }[]
  subscriptions: { plan_type: string; status: string }[]
}

function tomRole(role: string): 'ok' | 'atencao' | 'neutro' {
  if (role === 'admin') return 'atencao'
  if (role === 'professional') return 'ok'
  return 'neutro'
}

export default async function AdminUsuariosPage() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/suplementos/login')

  const profile = await getUserProfile(sessao.userId)

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const sql = getSql()
  const userList = await sql<UserRow[]>`
    SELECT u.id, u.full_name, u.email, u.client_code, u.role, u.created_at,
      COALESCE(ent.list, '[]'::jsonb) AS user_entitlements,
      COALESCE(sub.list, '[]'::jsonb) AS subscriptions
    FROM users u
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('product_key', e.product_key, 'status', e.status)
             ORDER BY e.product_key) AS list
      FROM user_entitlements e WHERE e.user_id = u.id) ent ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('plan_type', s.plan_type, 'status', s.status)
             ORDER BY s.id) AS list
      FROM subscriptions s WHERE s.user_id = u.id) sub ON true
    -- Só quem administra o sistema. Paciente fica de fora: são mais de mil,
    -- vivem na tela de Clientes, e afogavam exatamente a informação que esta
    -- tela existe para dar — quem tem acesso ao que aqui dentro.
    WHERE u.role <> 'patient'
    ORDER BY
      CASE u.role WHEN 'admin' THEN 0 WHEN 'professional' THEN 1 ELSE 2 END,
      u.created_at DESC
  `

  return (
    <div>
      <CabecaDePagina
        trilha="Ajustes / Acesso"
        titulo="Quem administra o sistema"
        acao={
          <span className="admin-num" style={{ color: 'var(--admin-tinta-fraca)', fontSize: 14 }}>
            {userList.length} {userList.length === 1 ? 'pessoa' : 'pessoas'}
          </span>
        }
      />

      <Card className="!p-0 overflow-hidden">
        {userList.length === 0 ? (
          <Vazio
            titulo="Ninguém com acesso interno"
            explicacao="Esta lista mostra apenas administradores, prescritores e suporte. Pacientes ficam na tela de Clientes."
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Código</th>
                <th>Role</th>
                <th>Plano</th>
                <th>Cadastro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {userList.map((u) => {
                const activeSub = u.subscriptions?.find(
                  (s) => s.status === 'active',
                )
                return (
                  <tr key={u.id}>
                    <td>
                      <p className="admin-nome">{u.full_name}</p>
                      <p className="admin-sub">{u.email}</p>
                    </td>
                    <td className="admin-mono admin-num">{u.client_code}</td>
                    <td>
                      <Selo tom={tomRole(u.role)}>{u.role}</Selo>
                    </td>
                    <td>
                      {activeSub ? (
                        <Selo tom="ok">{activeSub.plan_type}</Selo>
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
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        )}
      </Card>
    </div>
  )
}
