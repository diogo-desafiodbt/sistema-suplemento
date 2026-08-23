import type { ReactNode } from 'react'

type Props = {
  titulo: string
  /** Sempre obrigatório: "Nenhum X" sozinho é ambíguo. */
  explicacao: string
  acao?: ReactNode
}

export function Vazio({ titulo, explicacao, acao }: Props) {
  return (
    <div className="admin-vazio">
      <p className="admin-vazio-titulo">{titulo}</p>
      <p className="admin-vazio-texto">{explicacao}</p>
      {acao ? <div className="admin-vazio-acao">{acao}</div> : null}
    </div>
  )
}
