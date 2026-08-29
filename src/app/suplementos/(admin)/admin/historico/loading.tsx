import {
  EsqueletoBloco,
  EsqueletoCabeca,
  EsqueletoIndicadores,
} from '@/components/admin/Esqueleto'

export default function Carregando() {
  return (
    <>
      <EsqueletoCabeca />
      <EsqueletoIndicadores quantos={3} />
      <EsqueletoBloco linhas={8} />
    </>
  )
}
