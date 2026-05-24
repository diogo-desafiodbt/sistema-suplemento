import Link from 'next/link'

type AdminNavProps = {
  active: 'usuarios' | 'pedidos' | 'auditoria'
}

export function AdminNav({ active }: AdminNavProps) {
  const linkClass = (tab: AdminNavProps['active']) =>
    tab === active
      ? 'text-sm font-medium text-gray-900'
      : 'text-sm text-gray-500 hover:text-gray-700'

  return (
    <nav className="flex items-center gap-4">
      <Link href="/admin/usuarios" className={linkClass('usuarios')}>
        Usuários
      </Link>
      <Link href="/admin/pedidos" className={linkClass('pedidos')}>
        Pedidos
      </Link>
      <Link href="/admin/auditoria" className={linkClass('auditoria')}>
        Auditoria
      </Link>
    </nav>
  )
}
