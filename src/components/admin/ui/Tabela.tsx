import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

/** Sempre envolve a tabela em overflow-x para telas estreitas. */
export function Tabela({ children, className = '' }: Props) {
  return (
    <div className={`admin-tabela-wrap ${className}`.trim()}>
      <table className="admin-tabela">{children}</table>
    </div>
  )
}
