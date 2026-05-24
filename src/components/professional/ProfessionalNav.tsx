import Link from 'next/link'

type ProfessionalNavProps = {
  active: 'pendentes' | 'assinados'
}

export function ProfessionalNav({ active }: ProfessionalNavProps) {
  const linkClass = (tab: ProfessionalNavProps['active']) =>
    tab === active
      ? 'text-sm font-medium text-gray-900'
      : 'text-sm text-gray-500 hover:text-gray-700'

  return (
    <nav className="flex items-center gap-4 mt-2">
      <Link href="/profissional/fila" className={linkClass('pendentes')}>
        Pendentes
      </Link>
      <Link href="/profissional/assinados" className={linkClass('assinados')}>
        Assinados
      </Link>
    </nav>
  )
}
