import { AbaDeServico } from '@/components/admin/AbaDeServico'

export default function AdminConfigPage() {
  return (
    <main className="px-6 py-8">
      <AbaDeServico
        src="/suplementos/admin/painel/ajustes/config"
        titulo="Configurações"
      />
    </main>
  )
}
