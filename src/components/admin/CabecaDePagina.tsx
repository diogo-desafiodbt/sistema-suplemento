import type { ReactNode } from 'react'

type Props = {
  trilha: string
  titulo: string
  acao?: ReactNode
}

/** Trilha + título grande; `acao` à direita (ex.: filtro de período). */
export function CabecaDePagina({ trilha, titulo, acao }: Props) {
  return (
    <div className="admin-cabeca">
      <div className="min-w-0">
        <p className="admin-cabeca-trilha">{trilha}</p>
        <h1 className="admin-cabeca-titulo">{titulo}</h1>
      </div>
      {acao ? <div className="admin-cabeca-acao">{acao}</div> : null}
    </div>
  )
}
