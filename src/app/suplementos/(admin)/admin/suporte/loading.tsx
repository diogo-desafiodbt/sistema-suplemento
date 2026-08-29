import { EsqueletoBloco, EsqueletoCabeca } from '@/components/admin/Esqueleto'

export default function Carregando() {
  return (
    <>
      <EsqueletoCabeca />
      <EsqueletoBloco linhas={9} />
    </>
  )
}
