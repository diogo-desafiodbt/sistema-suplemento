import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario'
  children: ReactNode
}

export function Botao({
  variante = 'primario',
  children,
  className = '',
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`admin-btn admin-btn--${variante} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  )
}
