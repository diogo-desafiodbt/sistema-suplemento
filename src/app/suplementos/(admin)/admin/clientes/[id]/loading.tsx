import { EsqueletoBloco, EsqueletoCabeca } from '@/components/admin/Esqueleto'

export default function Carregando() {
  return (
    <>
      <EsqueletoCabeca />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <EsqueletoBloco linhas={3} />
        <EsqueletoBloco linhas={7} />
      </div>
    </>
  )
}
