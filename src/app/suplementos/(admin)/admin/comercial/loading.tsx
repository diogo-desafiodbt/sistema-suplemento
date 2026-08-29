import { EsqueletoCabeca, EsqueletoTabela } from '@/components/admin/Esqueleto'

export default function Carregando() {
  return (
    <>
      <EsqueletoCabeca />
      <EsqueletoTabela linhas={6} />
    </>
  )
}
