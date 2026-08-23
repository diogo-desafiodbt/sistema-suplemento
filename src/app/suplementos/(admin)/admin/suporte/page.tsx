import { redirect } from 'next/navigation'
import {
  SupportThreadPanel,
  type SupportThreadView,
} from '@/components/admin/SupportThreadPanel'
import { getUserProfile } from '@/lib/auth/profile'
import { getSql } from '@/lib/db'
import { sessaoAtual } from '@/lib/auth/sessao'

export default async function AdminSuportePage() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/suplementos/login')

  const profile = await getUserProfile(sessao.userId)

  if (profile?.role !== 'admin') redirect('/suplementos/dashboard')

  const sql = getSql()
  const [pendingRows, historyRows] = await Promise.all([
    sql<SupportThreadView[]>`
      SELECT t.id, t.from_email, t.subject, t.status, t.user_id, t.db_facts,
             t.suggested_reply, t.last_message_at, t.created_at,
        CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
          'full_name', u.full_name, 'email', u.email) END AS users,
        COALESCE(msgs.list, '[]'::jsonb) AS support_messages
      FROM support_threads t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', m.id, 'direction', m.direction, 'from_email', m.from_email,
          'body_text', m.body_text, 'created_at', m.created_at
        ) ORDER BY m.created_at) AS list
        FROM support_messages m WHERE m.thread_id = t.id
      ) msgs ON true
      WHERE t.status = ANY(${sql.array(['aguardando_revisao', 'aguardando_dados', 'novo'])}::support_thread_status[])
      ORDER BY t.last_message_at DESC
      LIMIT 500
    `,
    sql<SupportThreadView[]>`
      SELECT t.id, t.from_email, t.subject, t.status, t.user_id, t.db_facts,
             t.suggested_reply, t.last_message_at, t.created_at,
        CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
          'full_name', u.full_name, 'email', u.email) END AS users,
        COALESCE(msgs.list, '[]'::jsonb) AS support_messages
      FROM support_threads t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', m.id, 'direction', m.direction, 'from_email', m.from_email,
          'body_text', m.body_text, 'created_at', m.created_at
        ) ORDER BY m.created_at) AS list
        FROM support_messages m WHERE m.thread_id = t.id
      ) msgs ON true
      WHERE t.status = 'respondido'
      ORDER BY t.last_message_at DESC
      LIMIT 100
    `,
  ])

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-1">
          Operações
        </p>
        <h1 className="text-2xl font-bold text-[#13244f]">Suporte</h1>
        <p className="text-sm text-[#13244f]/60 mt-1">
          Revise sugestões antes de enviar. Só o aviso genérico sai sozinho.
        </p>
      </div>

      <SupportThreadPanel pending={pendingRows} history={historyRows} />
    </main>
  )
}
