'use client'

import { useMemo, useState } from 'react'
import { Botao } from '@/components/admin/ui/Botao'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { Vazio } from '@/components/admin/ui/Vazio'
import type { SupportDbFacts } from '@/lib/support/facts'

type SupportMessageView = {
  id: string
  direction: 'inbound' | 'outbound'
  from_email: string | null
  body_text: string | null
  created_at: string
}

export type SupportThreadView = {
  id: string
  from_email: string
  subject: string | null
  status: string
  user_id: string | null
  db_facts: SupportDbFacts | null
  suggested_reply: string | null
  last_message_at: string
  created_at: string
  users: { full_name: string | null; email: string | null } | null
  support_messages: SupportMessageView[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR')
}

function formatFacts(facts: SupportDbFacts | null): string[] {
  if (!facts) return ['Nenhum fato buscado ainda.']

  const lines: string[] = [`Categoria: ${facts.category}`]

  if (facts.category === 'frete' && facts.frete) {
    if (!facts.frete.found) {
      lines.push('Frete: nenhum pedido encontrado para este cliente.')
      return lines
    }
    lines.push(`Pedido: ${facts.frete.order_id}`)
    lines.push(`Status: ${facts.frete.status}`)
    lines.push(`Rastreio: ${facts.frete.tracking_code ?? '—'}`)
    if (facts.frete.last_event) {
      const ev = facts.frete.last_event
      lines.push(
        `Último evento: ${ev.descricao ?? '—'} (${[ev.cidade, ev.local].filter(Boolean).join(' / ') || '—'})`,
      )
    } else {
      lines.push('Último evento: —')
    }
    lines.push(
      `Previsão de entrega: ${
        facts.frete.estimated_delivery
          ? formatDate(facts.frete.estimated_delivery)
          : '—'
      }`,
    )
  }

  if (facts.category === 'pagamento' && facts.pagamento) {
    if (!facts.pagamento.found) {
      lines.push('Pagamento: nenhuma assinatura encontrada para este cliente.')
      return lines
    }
    lines.push(`Status pagamento: ${facts.pagamento.payment_status ?? '—'}`)
    lines.push(
      `Valor: ${
        facts.pagamento.amount != null
          ? facts.pagamento.amount.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })
          : '—'
      }`,
    )
    lines.push(`Plano: ${facts.pagamento.plan_type ?? '—'}`)
    lines.push(`Assinatura: ${facts.pagamento.subscription_status ?? '—'}`)
    lines.push(
      `Próx. cobrança: ${
        facts.pagamento.next_billing_at
          ? formatDate(facts.pagamento.next_billing_at)
          : '—'
      }`,
    )
    lines.push(
      `Expira em: ${
        facts.pagamento.expires_at
          ? formatDate(facts.pagamento.expires_at)
          : '—'
      }`,
    )
  }

  if (facts.category === 'fora_de_escopo') {
    lines.push(
      'Fora de escopo — sem consulta ao banco. Escreva a resposta manualmente.',
    )
  }

  return lines
}

function statusLabel(status: string): string {
  switch (status) {
    case 'aguardando_revisao':
      return 'Aguardando revisão'
    case 'aguardando_dados':
      return 'Aguardando dados'
    case 'respondido':
      return 'Respondido'
    case 'novo':
      return 'Novo'
    default:
      return status
  }
}

function tomStatus(status: string): 'ok' | 'atencao' | 'neutro' {
  if (status === 'respondido') return 'ok'
  if (status === 'aguardando_revisao' || status === 'novo') return 'atencao'
  return 'neutro'
}

function ThreadCard({
  thread,
  onSent,
}: {
  thread: SupportThreadView
  onSent: (id: string) => void
}) {
  const [text, setText] = useState(thread.suggested_reply ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const factLines = useMemo(
    () => formatFacts(thread.db_facts),
    [thread.db_facts],
  )
  const messages = [...(thread.support_messages ?? [])].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/suporte/${thread.id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_text: text }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Falha ao enviar')
        return
      }
      onSent(thread.id)
    } catch {
      setError('Erro de rede ao enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Selo tom={tomStatus(thread.status)}>{statusLabel(thread.status)}</Selo>
          <h2 className="admin-nome" style={{ fontSize: 18, marginTop: 8 }}>
            {thread.subject || '(sem assunto)'}
          </h2>
          <p className="admin-sub">
            De: {thread.from_email}
            {thread.users?.full_name ? ` · ${thread.users.full_name}` : ''}
            {!thread.user_id ? ' · cliente não identificado' : ''}
          </p>
          <p className="admin-sub admin-num">
            Última msg: {formatDate(thread.last_message_at)}
          </p>
        </div>
      </div>

      <p className="admin-card-rotulo">Histórico</p>
      <div style={{ maxHeight: 256, overflowY: 'auto', marginBottom: 16 }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: 8,
              padding: '8px 12px',
              borderRadius: 'var(--admin-raio)',
              background:
                m.direction === 'inbound'
                  ? 'var(--admin-fundo)'
                  : 'color-mix(in srgb, var(--admin-marinho) 6%, white)',
              whiteSpace: 'pre-wrap',
              fontSize: 14,
            }}
          >
            <p className="admin-sub" style={{ marginBottom: 4 }}>
              {m.direction === 'inbound' ? 'Cliente' : 'Suporte'} ·{' '}
              {formatDate(m.created_at)}
            </p>
            {m.body_text || '(vazio)'}
          </div>
        ))}
      </div>

      <p className="admin-card-rotulo">O que buscamos no banco</p>
      <ul
        style={{
          margin: '0 0 16px',
          padding: '10px 12px',
          listStyle: 'none',
          border: '1px solid var(--admin-borda)',
          borderRadius: 'var(--admin-raio)',
          fontSize: 14,
        }}
      >
        {factLines.map((line) => (
          <li key={line} style={{ marginTop: 2 }}>
            {line}
          </li>
        ))}
      </ul>

      {thread.status !== 'respondido' && (
        <div>
          <p className="admin-card-rotulo">Mensagem sugerida</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="admin-input"
            style={{ height: 'auto', padding: 12, resize: 'vertical' }}
            placeholder="Escreva ou edite a resposta ao cliente…"
          />
          {error ? (
            <p style={{ color: 'var(--admin-perigo)', fontSize: 14, marginTop: 8 }}>
              {error}
            </p>
          ) : null}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Botao
              type="button"
              variante="primario"
              onClick={handleSend}
              disabled={sending || !text.trim()}
            >
              {sending ? 'Enviando…' : 'Enviar'}
            </Botao>
          </div>
        </div>
      )}
    </Card>
  )
}

export function SupportThreadPanel({
  pending,
  history,
}: {
  pending: SupportThreadView[]
  history: SupportThreadView[]
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)

  const visiblePending = pending.filter((t) => !hidden.has(t.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="admin-card-rotulo">
          Pendentes ({visiblePending.length})
        </p>
        {visiblePending.length === 0 ? (
          <Card>
            <Vazio
              titulo="Nenhuma conversa aguardando ação"
              explicacao="A fila está vazia. Novos e-mails de suporte aparecem aqui depois da análise, prontos para revisão antes do envio."
            />
          </Card>
        ) : (
          visiblePending.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              onSent={(id) => setHidden((prev) => new Set(prev).add(id))}
            />
          ))
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="admin-link-suave"
          style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {showHistory
            ? 'Ocultar histórico'
            : `Ver histórico (${history.length})`}
        </button>
        {showHistory && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {history.length === 0 ? (
              <Card>
                <Vazio
                  titulo="Nenhuma thread respondida ainda"
                  explicacao="Conversas já enviadas ficam neste histórico para consulta. A fila de pendentes é o lugar de ação."
                />
              </Card>
            ) : (
              history.map((thread) => (
                <ThreadCard key={thread.id} thread={thread} onSent={() => {}} />
              ))
            )}
          </div>
        )}
      </section>
    </div>
  )
}
