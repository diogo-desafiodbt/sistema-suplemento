import type { ReactNode } from 'react'

type Props = {
  rotulo?: string
  verHref?: string
  verTexto?: string
  children: ReactNode
  className?: string
}

export function Card({
  rotulo,
  verHref,
  verTexto = 'Ver',
  children,
  className = '',
}: Props) {
  return (
    <section className={`admin-card ${className}`.trim()}>
      {(rotulo || verHref) && (
        <div className="admin-card-topo">
          {rotulo ? <h2 className="admin-card-rotulo">{rotulo}</h2> : <span />}
          {verHref ? (
            <a href={verHref} className="admin-card-ver">
              {verTexto}
            </a>
          ) : null}
        </div>
      )}
      {children}
    </section>
  )
}
