import type { ReactNode } from 'react'

type Props = {
  rotulo: string
  valor: string | number
  variacao?: { direcao: 'cima' | 'baixo' | 'neutro'; texto: string }
  detalhes?: string[]
  grafico?: ReactNode
}

export function CardIndicador({
  rotulo,
  valor,
  variacao,
  detalhes,
  grafico,
}: Props) {
  const seta =
    variacao?.direcao === 'cima'
      ? '↑'
      : variacao?.direcao === 'baixo'
        ? '↓'
        : '→'

  const corVariacao =
    variacao?.direcao === 'cima'
      ? 'var(--admin-ok)'
      : variacao?.direcao === 'baixo'
        ? 'var(--admin-perigo)'
        : 'var(--admin-tinta-fraca)'

  return (
    <section className="admin-card admin-card-indicador">
      <p className="admin-card-rotulo">{rotulo}</p>
      <p className="admin-indicador-valor">{valor}</p>
      {variacao ? (
        <p className="admin-indicador-variacao" style={{ color: corVariacao }}>
          <span aria-hidden>{seta}</span> {variacao.texto}
        </p>
      ) : null}
      {detalhes && detalhes.length > 0 ? (
        <ul className="admin-indicador-detalhes">
          {detalhes.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
      {grafico ? (
        <div className="admin-indicador-grafico">{grafico}</div>
      ) : null}
    </section>
  )
}
