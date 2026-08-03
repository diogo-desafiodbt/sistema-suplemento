'use client'

import { useMemo, useState } from 'react'
import type { SupportDbFacts } from '@/lib/support/facts'

export type SupportMessageView = {
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
        `Último evento: ${ev.descricao ?? '—'} (${[ev.cidade, ev.local].filter(Boolean).join(' / ') || '—'})`
      )
      if (ev.datahora) lines.push(`Data do evento: ${formatDate(ev.datahora)}`)
    } else {
      lines.push('Último evento: —')
    }
    lines.push(
      `Previsão de entrega: ${
        facts.frete.estimated_delivery
          ? formatDate(facts.frete.estimated_delivery)
          : '—'
      }`
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
      }`
    )
    lines.push(`Plano: ${facts.pagamento.plan_type ?? '—'}`)
    lines.push(`Assinatura: ${facts.pagamento.subscription_status ?? '—'}`)
    lines.push(
      `Próx. cobrança: ${
        facts.pagamento.next_billing_at
          ? formatDate(facts.pagamento.next_billing_at)
          : '—'
      }`
    )
    lines.push(
      `Expira em: ${
        facts.pagamento.expires_at ? formatDate(facts.pagamento.expires_at) : '—'
      }`
    )
  }

  if (facts.category === 'fora_de_escopo') {
    lines.push('Fora de escopo — sem consulta ao banco. Escreva a resposta manualmente.')
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
  const factLines = useMemo(() => formatFacts(thread.db_facts), [thread.db_facts])
  const messages = [...(thread.support_messages ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
    <article className="rounded-2xl border border-[#13244f]/10 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase">
            {statusLabel(thread.status)}
          </p>
          <h2 className="text-lg font-semibold text-[#13244f] mt-1">
            {thread.subject || '(sem assunto)'}
          </h2>
          <p className="text-sm text-[#13244f]/70 mt-1">
            De: {thread.from_email}
            {thread.users?.full_name ? ` · ${thread.users.full_name}` : ''}
            {!thread.user_id ? ' · cliente não identificado' : ''}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Última msg: {formatDate(thread.last_message_at)}
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-2">
          Histórico
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.direction === 'inbound'
                  ? 'bg-[#f5f0eb] text-[#13244f]'
                  : 'bg-[#13244f]/5 text-[#13244f]/90'
              }`}
            >
              <p className="text-[11px] font-medium text-[#13244f]/50 mb-1">
                {m.direction === 'inbound' ? 'Cliente' : 'Suporte'} ·{' '}
                {formatDate(m.created_at)}
              </p>
              {m.body_text || '(vazio)'}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-2">
          O que buscamos no banco
        </p>
        <ul className="text-sm text-[#13244f]/80 space-y-1 bg-[#fafafa] rounded-lg px-3 py-2 border border-gray-100">
          {factLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {thread.status !== 'respondido' && (
        <div>
          <p className="text-xs font-bold tracking-widest text-[#13244f]/50 uppercase mb-2">
            Mensagem sugerida
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-[#13244f]/15 px-3 py-2 text-sm text-[#13244f] focus:outline-none focus:ring-2 focus:ring-[#13244f]/30"
            placeholder="Escreva ou edite a resposta ao cliente…"
          />
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="rounded-lg bg-[#f4001e] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#d4001a] transition"
            >
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </article>
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
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-widest text-[#13244f]/50 uppercase">
            Pendentes ({visiblePending.length})
          </h2>
        </div>
        {visiblePending.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma conversa aguardando ação.</p>
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
          className="text-sm font-medium text-[#13244f]/70 hover:text-[#13244f]"
        >
          {showHistory ? 'Ocultar histórico' : `Ver histórico (${history.length})`}
        </button>
        {showHistory && (
          <div className="mt-4 space-y-4">
            {history.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma thread respondida ainda.</p>
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
