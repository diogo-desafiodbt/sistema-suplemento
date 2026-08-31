import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { CadastroMfa } from '@/components/admin/CadastroMfa'
import { exigirAdmin } from '@/lib/auth/admin'

export default async function AdminSegurancaPage() {
  const admin = await exigirAdmin()

  return (
    <>
      <CabecaDePagina trilha="Ajustes / Segurança" titulo="Sua conta" />
      <Card rotulo="Verificação em duas etapas">
        <p className="admin-vazio-texto" style={{ margin: '0 0 18px', maxWidth: '62ch' }}>
          Sua conta abre o cadastro completo de todos os clientes — nome, CPF,
          telefone, endereço e histórico de compra. Hoje só a senha separa
          alguém desses dados. Com a verificação em duas etapas, quem tiver a
          senha ainda precisa do código do seu celular.
        </p>
        <CadastroMfa email={admin.email ?? ''} />
      </Card>
    </>
  )
}
