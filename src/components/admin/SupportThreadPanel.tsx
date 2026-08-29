'use client'

import { useMemo, useRef, useState } from 'react'
import { Botao } from '@/components/admin/ui/Botao'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { TextoDobravel } from '@/components/admin/TextoDobravel'
import { Vazio } from '@/components/admin/ui/Vazio'
import type { Triagem } from '@/lib/support/triage'

type DecisaoPainel = {
  travas_liberadas?: boolean
  motivos_travas?: string[]
  pode_resolver_sozinho?: boolean
  motivo_escalonamento?: string | null
  dados_usados?: string[]
  origem?: string
}

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
  suggested_reply: string | null
  triagem_ia: Triagem | null
  decisao_ia: DecisaoPainel | null
  enviado_automaticamente?: boolean
  last_message_at: string
  created_at: string
  users: { full_name: string | null; email: string | null } | null
  support_messages: SupportMessageView[]
}

type Aba = 'fila' | 'com_suporte' | 'auto_ia' | 'encerradas'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR')
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
    case 'nova':
      return 'Nova'
    case 'com_ia':
      return 'Com a IA'
    case 'com_suporte':
      return 'Com o suporte'
    case 'encerrada':
      return 'Encerrada'
    default:
      return status
  }
}

function tomStatus(status: string): 'ok' | 'atencao' | 'neutro' | 'perigo' {
  if (status === 'encerrada' || status === 'respondido') return 'ok'
  if (status === 'com_suporte') return 'neutro'
  if (status === 'aguardando_revisao' || status === 'nova' || status === 'novo')
    return 'atencao'
  return 'neutro'
}

function ThreadCard({
  thread,
  onMoved,
  somenteLeitura,
}: {
  thread: SupportThreadView
  onMoved: (id: string) => void
  somenteLeitura?: boolean
}) {
  const [text, setText] = useState(thread.suggested_reply ?? '')
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Veredito sobre a sugestão da IA. `null` = ele ainda não decidiu; nesse
  // caso o botão de enviar fica bloqueado, porque o julgamento é o dado que
  // este período existe para colher.
  const [veredito, setVeredito] = useState<'aprovada' | 'rejeitada' | null>(
    null,
  )
  // Quando a conversa abriu. Aprovação em três segundos não é leitura, é
  // carimbo — e uma taxa de acerto cheia de carimbo engana quem for decidir
  // ligar o envio automático.
  const abertoEm = useRef<number>(Date.now())
  // O que estava errado na sugestão, nas palavras dele. O texto que ele envia
  // mostra o que era certo; isto mostra por quê a IA errou, que é o que
  // ensina. Obrigatório quando ele rejeita.
  const [observacao, setObservacao] = useState('')

  const messages = useMemo(
    () =>
      [...(thread.support_messages ?? [])].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [thread.support_messages],
  )
  const inbound = messages.filter((m) => m.direction === 'inbound')
  const outbound = messages.filter((m) => m.direction === 'outbound')
  const decisao = thread.decisao_ia
  const triagem = thread.triagem_ia
  const aberta =
    !somenteLeitura &&
    thread.status !== 'encerrada' &&
    thread.status !== 'respondido'

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/suporte/${thread.id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_text: text,
          veredito: veredito ?? undefined,
          segundos: Math.round((Date.now() - abertoEm.current) / 1000),
          observacao: observacao.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Falha ao enviar')
        return
      }
      onMoved(thread.id)
    } catch {
      setError('Erro de rede ao enviar')
    } finally {
      setSending(false)
    }
  }

  async function handleEncerrar() {
    if (
      !window.confirm(
        'Encerrar esta conversa? O cliente recebe a mensagem padrão de encerramento.',
      )
    ) {
      return
    }
    setClosing(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/suporte/${thread.id}/encerrar`, {
        method: 'POST',
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Falha ao encerrar')
        return
      }
      onMoved(thread.id)
    } catch {
      setError('Erro de rede ao encerrar')
    } finally {
      setClosing(false)
    }
  }

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <Selo tom={tomStatus(thread.status)}>
            {statusLabel(thread.status)}
          </Selo>
          {thread.enviado_automaticamente ? (
            <span style={{ marginLeft: 8 }}>
              <Selo tom="ok">Enviado pela IA</Selo>
            </span>
          ) : null}
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

      {/* Duas colunas em tela larga: a fonte de um lado, o julgamento e a
          resposta do outro. Empilhado, o e-mail do cliente e o rascunho ficavam
          a uma rolagem de distancia um do outro — e sao justamente as duas
          coisas que precisam ser lidas juntas. */}
      <div className="suporte-duas-colunas">
      <div>
      {/* Fonte: e-mail do cliente em destaque — o Pedro julga por isto. */}
      <p className="admin-card-rotulo">E-mail do cliente</p>
      <div style={{ marginBottom: 24 }}>
        {inbound.length === 0 ? (
          <p className="admin-sub">
            Nenhuma mensagem do cliente nesta conversa.
          </p>
        ) : (
          inbound.map((m) => (
            <div key={m.id} style={{ marginBottom: 12 }}>
              <p className="admin-sub" style={{ marginBottom: 6 }}>
                {formatDate(m.created_at)}
              </p>
              <TextoDobravel texto={m.body_text} />
            </div>
          ))
        )}
      </div>

      {/* Interpretação da IA — subordinada, nunca como fato. Fechada por
          padrão: é palpite de máquina, e não deve ocupar a tela antes de
          alguém pedir. O resumo dela fica no cabeçalho, que já basta na
          maioria das conversas. */}
      <details className="admin-recolhivel">
        <summary>
          <span>Leitura da IA</span>
          <span className="admin-recolhivel-resumo">
            {triagem?.pergunta_resumida
              ? `— ${triagem.pergunta_resumida}`
              : '— sem triagem'}
          </span>
        </summary>
        <div className="admin-recolhivel-corpo">

        {triagem ? (
          <ul
            style={{
              margin: '0 0 12px',
              padding: 0,
              listStyle: 'none',
              fontSize: 14,
            }}
          >
            <li>
              <strong>Categoria:</strong> {triagem.categoria}
            </li>
            <li>
              <strong>Tom:</strong> {triagem.tom} · <strong>Urgência:</strong>{' '}
              {triagem.urgencia}
            </li>
            <li>
              <strong>Resumo (IA):</strong> {triagem.pergunta_resumida}
            </li>
            {triagem.referencia_citada ? (
              <li>
                <strong>Referência citada:</strong> {triagem.referencia_citada}
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="admin-sub" style={{ marginBottom: 12 }}>
            Sem triagem — a classificação falhou ou ainda não rodou.
          </p>
        )}

        {decisao ? (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              fontSize: 14,
            }}
          >
            <li>
              <strong>Achou que resolvia sozinha:</strong>{' '}
              {decisao.pode_resolver_sozinho ? 'sim' : 'não'}
            </li>
            {decisao.motivo_escalonamento ? (
              <li>
                <strong>Motivo do escalonamento:</strong>{' '}
                {decisao.motivo_escalonamento}
              </li>
            ) : null}
            <li style={{ marginTop: 8 }}>
              <strong>Travas:</strong>{' '}
              {decisao.travas_liberadas
                ? 'todas passaram (envio automático só com a chave em on)'
                : 'reprovadas — uma a uma:'}
            </li>
            {(decisao.motivos_travas ?? []).map((m) => (
              <li key={m} style={{ paddingLeft: 12 }}>
                · {m}
              </li>
            ))}
            <li style={{ marginTop: 8 }}>
              <strong>Dados que a IA diz ter usado:</strong>
            </li>
            {(decisao.dados_usados ?? []).length === 0 ? (
              <li style={{ paddingLeft: 12 }}>· (nenhum)</li>
            ) : (
              (decisao.dados_usados ?? []).map((d) => (
                <li key={d} style={{ paddingLeft: 12 }}>
                  · {d}
                </li>
              ))
            )}
            {decisao.origem === 'modelo_fixo_tecnico' ? (
              <li style={{ marginTop: 8 }}>
                Resposta técnica: modelo fixo (sem redação da IA).
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="admin-sub">Ainda sem decisão gravada.</p>
        )}
        </div>
      </details>

      </div>

      {/* Direita: o que o Pedro faz. O rascunho é a primeira coisa da coluna
          porque é onde ele passa o tempo. */}
      <div>
      {outbound.length > 0 ? (
        <>
          <p className="admin-card-rotulo">Já enviado nesta conversa</p>
          <div style={{ marginBottom: 16 }}>
            {outbound.map((m) => (
              <div key={m.id} style={{ marginBottom: 8 }}>
                <p className="admin-sub" style={{ marginBottom: 4 }}>
                  {formatDate(m.created_at)}
                </p>
                <TextoDobravel texto={m.body_text} linhas={4} />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {aberta ? (
        <div>
          <p className="admin-card-rotulo">Rascunho (editável)</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="admin-area"
            placeholder="Escreva ou edite a resposta ao cliente…"
          />
          {error ? (
            <p
              style={{
                color: 'var(--admin-perigo)',
                fontSize: 14,
                marginTop: 8,
              }}
            >
              {error}
            </p>
          ) : null}
          {/* O julgamento sobre a sugestão da IA. Enquanto ele não decidir, o
              envio fica bloqueado — este período existe para colher esse
              dado, e uma resposta enviada sem veredito é uma amostra
              perdida. Rejeitar não apaga o texto: ele reescreve por cima. */}
          {thread.suggested_reply ? (
            <div className="sugestao-veredito">
              <p className="sugestao-veredito-pergunta">
                A sugestão da IA servia?
              </p>
              <div className="sugestao-veredito-botoes">
                <button
                  type="button"
                  onClick={() => {
                    setVeredito('aprovada')
                    setText(thread.suggested_reply ?? '')
                  }}
                  className={
                    veredito === 'aprovada'
                      ? 'sugestao-btn sugestao-btn--sim sugestao-btn--ativo'
                      : 'sugestao-btn sugestao-btn--sim'
                  }
                >
                  Servia — vou enviar
                </button>
                <button
                  type="button"
                  onClick={() => setVeredito('rejeitada')}
                  className={
                    veredito === 'rejeitada'
                      ? 'sugestao-btn sugestao-btn--nao sugestao-btn--ativo'
                      : 'sugestao-btn sugestao-btn--nao'
                  }
                >
                  Não servia — escrevo outra
                </button>
              </div>
              <p className="sugestao-veredito-nota">
                {veredito === 'aprovada'
                  ? 'Pode ajustar o texto antes de enviar. A diferença entre o que a IA escreveu e o que você mandar é registrada.'
                  : veredito === 'rejeitada'
                    ? 'Escreva a resposta certa abaixo. O que você escrever é o que ensina a IA.'
                    : 'Responda para liberar o envio.'}
              </p>

              {veredito ? (
                <div className="sugestao-obs">
                  <label htmlFor="obs-sugestao">
                    {veredito === 'rejeitada'
                      ? 'O que estava errado na sugestão?'
                      : 'Mudou alguma coisa? Conte o quê e por quê (opcional)'}
                  </label>
                  <textarea
                    id="obs-sugestao"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={2}
                    placeholder={
                      veredito === 'rejeitada'
                        ? 'Ex.: inventou uma falha de acesso que não existe; o sistema não controla acesso ao guia'
                        : 'Ex.: troquei o prazo, o correto é 2 dias úteis'
                    }
                  />
                  {veredito === 'rejeitada' && !observacao.trim() ? (
                    <span className="sugestao-obs-aviso">
                      Preencha para liberar o envio — sem isto, daqui a um mês
                      teremos os textos e não o motivo.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 12,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              justifyContent: 'flex-end',
            }}
          >
            <Botao
              type="button"
              variante="secundario"
              onClick={handleEncerrar}
              disabled={sending || closing}
            >
              {closing ? 'Encerrando…' : 'Encerrar conversa'}
            </Botao>
            <Botao
              type="button"
              variante="primario"
              onClick={handleSend}
              disabled={
                sending ||
                closing ||
                !text.trim() ||
                (!!thread.suggested_reply && veredito === null) ||
                (veredito === 'rejeitada' && !observacao.trim())
              }
            >
              {sending ? 'Enviando…' : 'Enviar'}
            </Botao>
          </div>
        </div>
      ) : null}
      </div>
      </div>
    </Card>
  )
}

function ListaAba({
  threads,
  vazioTitulo,
  vazioTexto,
  somenteLeitura,
  onMoved,
}: {
  threads: SupportThreadView[]
  vazioTitulo: string
  vazioTexto: string
  somenteLeitura?: boolean
  onMoved: (id: string) => void
}) {
  if (threads.length === 0) {
    return (
      <Card>
        <Vazio titulo={vazioTitulo} explicacao={vazioTexto} />
      </Card>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {threads.map((thread) => (
        <ThreadCard
          key={thread.id}
          thread={thread}
          somenteLeitura={somenteLeitura}
          onMoved={onMoved}
        />
      ))}
    </div>
  )
}

export function SupportThreadPanel({
  fila,
  comSuporte,
  autoIa,
  encerradas,
}: {
  fila: SupportThreadView[]
  comSuporte: SupportThreadView[]
  autoIa: SupportThreadView[]
  encerradas: SupportThreadView[]
}) {
  const [aba, setAba] = useState<Aba>('fila')
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const ocultar = (id: string) => setHidden((prev) => new Set(prev).add(id))

  const listaFila = fila.filter((t) => !hidden.has(t.id))
  const listaComSuporte = comSuporte.filter((t) => !hidden.has(t.id))

  const abas: { id: Aba; rotulo: string; n: number }[] = [
    { id: 'fila', rotulo: 'Na fila', n: listaFila.length },
    { id: 'com_suporte', rotulo: 'Com o suporte', n: listaComSuporte.length },
    { id: 'auto_ia', rotulo: 'Respondidas pela IA', n: autoIa.length },
    { id: 'encerradas', rotulo: 'Encerradas', n: encerradas.length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="admin-abas" role="tablist" aria-label="Filas de suporte">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            className={
              aba === a.id ? 'admin-aba admin-aba--ativa' : 'admin-aba'
            }
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
            <span className="admin-aba-contagem">{a.n}</span>
          </button>
        ))}
      </div>

      {aba === 'fila' ? (
        <ListaAba
          threads={listaFila}
          vazioTitulo="Fila vazia"
          vazioTexto="Novas conversas aparecem aqui depois da análise, prontas para você revisar."
          onMoved={ocultar}
        />
      ) : null}
      {aba === 'com_suporte' ? (
        <ListaAba
          threads={listaComSuporte}
          vazioTitulo="Nenhuma conversa com o suporte"
          vazioTexto="Quando você responder, a conversa vem para cá — a IA não toma mais a frente."
          onMoved={ocultar}
        />
      ) : null}
      {aba === 'auto_ia' ? (
        <ListaAba
          threads={autoIa}
          vazioTitulo="Nada enviado pela IA ainda"
          vazioTexto="Esta aba existe para auditar as primeiras semanas depois que a chave automática for ligada. Hoje fica vazia de propósito."
          somenteLeitura
          onMoved={() => {}}
        />
      ) : null}
      {aba === 'encerradas' ? (
        <ListaAba
          threads={encerradas}
          vazioTitulo="Nenhuma conversa encerrada"
          vazioTexto="Conversas fechadas pelo botão Encerrar ficam aqui. Se o cliente escrever de novo, abre conversa nova."
          somenteLeitura
          onMoved={() => {}}
        />
      ) : null}
    </div>
  )
}
