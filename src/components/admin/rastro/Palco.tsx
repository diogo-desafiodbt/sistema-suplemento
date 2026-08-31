'use client'

import { useState } from 'react'
import { CORES, type Mapa, MAPAS, type No } from '@/lib/rastro/mapas'
import type { NumerosDoFluxo } from '@/lib/rastro/consultas'

// Geometria do protótipo aprovado em 30/08. Nó de 176 de largura, colunas
// separadas por 92, linhas por 34 — números soltos, mas são o que faz o fio
// curvo sair limpo entre dois nós sem passar por cima de um terceiro.
const LARG = 176
const GAP_X = 92
const GAP_Y = 34
const ALT = 92
const PAD = 30
const TOPO = 34

const ICONES: Record<string, React.ReactNode> = {
  play: <path d="M8 5v14l11-7z" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  doc: <path d="M6 2h8l4 4v16H6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  cart: (
    <>
      <path d="M3 4h2l2.5 12h11l2-8H7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="1.6" />
      <circle cx="18" cy="20" r="1.6" />
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  quiz: (
    <>
      <path d="M9 9a3 3 0 1 1 4 2.8c-.8.3-1 .9-1 1.7v.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.3" />
    </>
  ),
  box: <path d="M3 8l9-5 9 5v8l-9 5-9-5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  star: <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  fone: <path d="M4 13a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-2v-6h4M4 13v5a2 2 0 0 0 2 2h2v-6H4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
}

function numeroDoNo(no: No, n: NumerosDoFluxo): number | null {
  if (!no.fonte) return null
  if (no.fonte.tipo === 'evento') return n.porEvento[no.fonte.evento] ?? 0
  if (no.fonte.tipo === 'contagem') return n[no.fonte.chave]
  // Origem por prefixo: `yt-` junta todos os vídeos numa entrada só.
  const prefixo = no.fonte.prefixo
  return Object.entries(n.porOrigem)
    .filter(([o]) => (prefixo ? o.startsWith(prefixo) : true))
    .reduce((s, [, v]) => s + v, 0)
}

const fmt = (n: number) => n.toLocaleString('pt-BR')

export function Palco({
  numeros,
  aoEscolher,
}: {
  numeros: NumerosDoFluxo
  /** Avisa a página qual etapa foi clicada, para a fila de contato abaixo. */
  aoEscolher: (evento: string | null, nome: string) => void
}) {
  const [chave, setChave] = useState(MAPAS[0].chave)
  const [ativo, setAtivo] = useState<string | null>(null)

  const mapa = MAPAS.find((m) => m.chave === chave) as Mapa
  const porId = Object.fromEntries(mapa.nos.map((n) => [n.id, n]))
  const valor = Object.fromEntries(
    mapa.nos.map((n) => [n.id, numeroDoNo(n, numeros)]),
  ) as Record<string, number | null>

  const maxCol = Math.max(...mapa.nos.map((n) => n.col))
  const maxLin = Math.max(...mapa.nos.map((n) => n.lin))
  const largura = PAD * 2 + (maxCol + 1) * LARG + maxCol * GAP_X
  const altura = TOPO + PAD * 2 + (maxLin + 1) * ALT + maxLin * GAP_Y
  const pos = (n: No) => ({
    x: PAD + n.col * (LARG + GAP_X),
    y: TOPO + PAD + n.lin * (ALT + GAP_Y),
  })

  // A espessura do fio conta volume, com teto: um fio de doze mil não pode
  // virar mancha ao lado de um de trinta.
  const maior = Math.max(
    ...mapa.fios.map((f) => valor[f.para] ?? 0),
    1,
  )

  function clicar(no: No) {
    const mesmo = ativo === no.id
    setAtivo(mesmo ? null : no.id)
    const evento = no.fonte?.tipo === 'evento' ? no.fonte.evento : null
    aoEscolher(mesmo ? null : evento, no.nome)
  }

  return (
    <>
      <div className="rastro-abas" role="tablist">
        {MAPAS.map((m) => (
          <button
            key={m.chave}
            type="button"
            role="tab"
            className="rastro-aba"
            aria-selected={m.chave === chave}
            onClick={() => {
              setChave(m.chave)
              setAtivo(null)
              aoEscolher(null, '')
            }}
          >
            {m.rotulo}
          </button>
        ))}
      </div>

      <div className="rastro-tela">
        <div className="rastro-palco" style={{ width: largura, height: altura }}>
          <svg className="rastro-fios" width={largura} height={altura} aria-hidden="true">
            <title>Ligações entre as etapas</title>
            {mapa.fios.map((f) => {
              const a = pos(porId[f.de])
              const b = pos(porId[f.para])
              const x1 = a.x + LARG
              const y1 = a.y + ALT / 2
              const x2 = b.x
              const y2 = b.y + ALT / 2
              const cx = (x2 - x1) * 0.55
              const q = valor[f.para]
              const esp = !q ? 1.5 : 1.5 + Math.sqrt(q / maior) * 5
              const apaga = ativo && f.de !== ativo && f.para !== ativo
              return (
                <g key={`${f.de}-${f.para}`}>
                  <path
                    d={`M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`}
                    className={`rastro-fio${q && q / maior > 0.5 ? ' rastro-fio--forte' : ''}${apaga ? ' rastro-fio--apaga' : ''}`}
                    strokeWidth={esp.toFixed(2)}
                    strokeDasharray={f.tracejado ? '5 5' : undefined}
                  />
                  <text
                    className="rastro-fio-rotulo"
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 7}
                    textAnchor="middle"
                  >
                    {q === null ? 'sem medida' : fmt(q)}
                  </text>
                </g>
              )
            })}
          </svg>

          {mapa.colunas.map((c, i) => (
            <div
              key={c}
              className="rastro-coluna-rotulo"
              style={{ left: PAD + i * (LARG + GAP_X), top: 12, width: LARG }}
            >
              {c}
            </div>
          ))}

          {mapa.nos.map((no) => {
            const p = pos(no)
            const n = valor[no.id]
            const entrada = mapa.fios.find((f) => f.para === no.id)
            const anterior = entrada ? valor[entrada.de] : null
            const queda =
              anterior && anterior > 0 && n !== null
                ? Math.round(((anterior - n) / anterior) * 100)
                : null
            return (
              <button
                key={no.id}
                type="button"
                className={`rastro-no${ativo && ativo !== no.id ? ' rastro-no--apaga' : ''}`}
                style={{ left: p.x, top: p.y }}
                aria-current={ativo === no.id}
                onClick={() => clicar(no)}
              >
                <span className={`rastro-fita rastro-fita--${n === null ? 'cego' : 'medido'}`}>
                  {n === null ? 'cego' : 'medido'}
                </span>
                <span className="rastro-no-topo">
                  <span className="rastro-no-icone" style={{ background: CORES[no.cor] }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      {ICONES[no.icone]}
                    </svg>
                  </span>
                  <span className="rastro-no-nome">{no.nome}</span>
                </span>
                <span className="rastro-no-num">{n === null ? '—' : fmt(n)}</span>
                <span className="rastro-no-pe">
                  <span className="rastro-no-sub">{no.sub}</span>
                  {queda !== null && queda > 0 && (
                    <span className={`rastro-queda rastro-queda--${queda >= 50 ? 'grave' : queda >= 25 ? 'media' : 'leve'}`}>
                      −{queda}%
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
