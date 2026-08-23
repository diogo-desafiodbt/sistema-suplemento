import { redirect } from 'next/navigation'
import { sessaoAtual } from '@/lib/auth/sessao'
import { perguntarAoNucleo } from '@/lib/contrato/nucleo'

export default async function DashboardPage() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/suplementos/login')

  const papel = await perguntarAoNucleo<{
    role: string
    full_name: string | null
    client_code: string | null
  }>('meu-papel')

  if (!papel) redirect('/suplementos/login')

  if (papel.role === 'professional') redirect('/suplementos/profissional/fila')
  if (papel.role === 'admin') redirect('/suplementos/admin/usuarios')

  redirect('/suplementos/dashboard/pedidos')
}
