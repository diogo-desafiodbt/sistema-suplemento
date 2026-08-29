import {
  EsqueletoBloco,
  EsqueletoCabeca,
  EsqueletoIndicadores,
} from '@/components/admin/Esqueleto'

export default function Carregando() {
  return (
    <>
      <EsqueletoCabeca />
      <EsqueletoIndicadores quantos={4} />
      <div className="admin-grid-2">
        <EsqueletoBloco linhas={6} />
        <EsqueletoBloco linhas={4} />
      </div>
    </>
  )
}
