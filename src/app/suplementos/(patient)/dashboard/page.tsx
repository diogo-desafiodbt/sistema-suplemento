import { redirect } from 'next/navigation'
import { NAO_ENCONTRADO, perguntarAoNucleo } from '@/lib/contrato/nucleo'

export default async function DashboardPage() {
  // Portal não tem DATABASE_URL — sessão vem do JWT no middleware e do núcleo.
  const papel = await perguntarAoNucleo<{
    role: string
    full_name: string | null
    client_code: string | null
  }>('meu-papel')

  // 401 e 404 aqui significam a mesma coisa: o núcleo não reconhece esta
  // sessão. Não existe pedido inexistente a distinguir.
  if (!papel || papel === NAO_ENCONTRADO) redirect('/suplementos/login')

  if (papel.role === 'professional') redirect('/suplementos/profissional/fila')
  if (papel.role === 'admin') redirect('/suplementos/admin/usuarios')

  redirect('/suplementos/dashboard/pedidos')
}
