import type { ReactNode } from 'react'

type Tom = 'ok' | 'perigo' | 'atencao' | 'neutro'

type Props = {
  tom?: Tom
  children: ReactNode
}

export function Selo({ tom = 'neutro', children }: Props) {
  return <span className={`admin-selo admin-selo--${tom}`}>{children}</span>
}
