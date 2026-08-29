// Esqueletos de carregamento.
//
// Nenhum deles deixa a tela mais rapida. Eles trocam a tela parada por uma
// tela que ja tem a forma do que vem — que e onde estava a queixa de lentidao
// medida em 29/08: o admin nao tinha `loading.tsx` nem `Suspense` em lugar
// nenhum, entao o Next segurava a navegacao inteira antes de pintar.
//
// A forma do esqueleto imita a da tela real. Um bloco generico piscando avisa
// que algo carrega; um que ja tem quatro cartoes em cima e uma tabela embaixo
// avisa o que carrega.

function Osso({
  largura,
  altura = 11,
  margem,
}: {
  largura?: number | string
  altura?: number
  margem?: string
}) {
  return (
    <span
      className="admin-osso"
      style={{
        width:
          typeof largura === 'number' ? `${largura}%` : (largura ?? '100%'),
        height: altura,
        margin: margem,
      }}
    />
  )
}

export function EsqueletoCabeca() {
  return (
    <div className="admin-cabeca">
      <div style={{ flex: 1 }}>
        <Osso largura={90} altura={12} margem="0 0 9px" />
        <Osso largura={34} altura={26} />
      </div>
    </div>
  )
}

/** Fileira de indicadores — a forma da visao geral e das telas com numeros. */
export function EsqueletoIndicadores({ quantos = 4 }: { quantos?: number }) {
  return (
    <div className="admin-esqueleto-grade">
      {Array.from({ length: quantos }, (_, i) => `kpi-${i}`).map((chave) => (
        <div key={chave} className="admin-card">
          <Osso largura={58} altura={12} margem="0 0 10px" />
          <Osso largura={40} altura={26} />
        </div>
      ))}
    </div>
  )
}

/** Lista — a forma de clientes, pedidos, auditoria, usuarios. */
export function EsqueletoTabela({ linhas = 8 }: { linhas?: number }) {
  return (
    <div className="admin-card">
      <Osso largura={170} altura={14} margem="0 0 18px" />
      {Array.from({ length: linhas }, (_, i) => i).map((i) => (
        <div
          key={`linha-${i}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 1fr 0.8fr',
            gap: 16,
            padding: '11px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--admin-borda-fraca)',
          }}
        >
          <Osso largura={72} />
          <Osso largura={54} />
          <Osso largura={46} />
          <Osso largura={62} />
        </div>
      ))}
    </div>
  )
}

/** Bloco de texto — a forma do painel de suporte e da ficha. */
export function EsqueletoBloco({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="admin-card">
      <Osso largura={150} altura={14} margem="0 0 16px" />
      {Array.from({ length: linhas }, (_, i) => i).map((i) => (
        <Osso
          key={`texto-${i}`}
          largura={i === linhas - 1 ? 63 : 100 - i * 6}
          margem="0 0 11px"
        />
      ))}
    </div>
  )
}
