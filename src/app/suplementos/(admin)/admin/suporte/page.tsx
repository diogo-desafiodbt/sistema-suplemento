import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import {
  SupportThreadPanel,
  type SupportThreadView,
} from '@/components/admin/SupportThreadPanel'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSql } from '@/lib/db'

export default async function AdminSuportePage() {
  await exigirAdmin()

  const sql = getSql()

  const [fila, comSuporte, autoIa, encerradas] = await Promise.all([
    sql<SupportThreadView[]>`
      SELECT t.id, t.from_email, t.subject, t.status, t.user_id,
             t.suggested_reply, t.triagem_ia, t.decisao_ia, t.enviado_automaticamente,
             t.last_message_at, t.created_at,
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
      WHERE t.status = ANY(${sql.array(['nova', 'com_ia', 'aguardando_revisao', 'aguardando_dados', 'novo'])}::support_thread_status[])
        AND COALESCE(t.enviado_automaticamente, false) = false
      ORDER BY t.last_message_at DESC
      LIMIT 500
    `,
    sql<SupportThreadView[]>`
      SELECT t.id, t.from_email, t.subject, t.status, t.user_id,
             t.suggested_reply, t.triagem_ia, t.decisao_ia, t.enviado_automaticamente,
             t.last_message_at, t.created_at,
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
      WHERE t.status = 'com_suporte'::support_thread_status
      ORDER BY t.last_message_at DESC
      LIMIT 200
    `,
    sql<SupportThreadView[]>`
      SELECT t.id, t.from_email, t.subject, t.status, t.user_id,
             t.suggested_reply, t.triagem_ia, t.decisao_ia, t.enviado_automaticamente,
             t.last_message_at, t.created_at,
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
      WHERE t.enviado_automaticamente = true
      ORDER BY t.last_message_at DESC
      LIMIT 200
    `,
    sql<SupportThreadView[]>`
      SELECT t.id, t.from_email, t.subject, t.status, t.user_id,
             t.suggested_reply, t.triagem_ia, t.decisao_ia, t.enviado_automaticamente,
             t.last_message_at, t.created_at,
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
      WHERE t.status = ANY(${sql.array(['encerrada', 'respondido'])}::support_thread_status[])
      ORDER BY t.last_message_at DESC
      LIMIT 200
    `,
  ])

  return (
    <>
      <CabecaDePagina trilha="Operação / Suporte" titulo="Suporte" />
      <p className="admin-sub" style={{ marginTop: -12, marginBottom: 20 }}>
        Julgue pelo e-mail do cliente. A leitura da IA é só interpretação — nada
        sai sozinho enquanto a chave estiver em off.
      </p>
      <SupportThreadPanel
        fila={fila}
        comSuporte={comSuporte}
        autoIa={autoIa}
        encerradas={encerradas}
      />
    </>
  )
}
