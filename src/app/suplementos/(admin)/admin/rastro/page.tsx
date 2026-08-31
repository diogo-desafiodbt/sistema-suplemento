import Link from 'next/link'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Fluxo } from '@/components/admin/rastro/Fluxo'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSql } from '@/lib/db'
import {
  type Etapa,
  ETAPAS,
  numerosDoFluxo,
  paradosEm,
  porOrigem,
} from '@/lib/rastro/consultas'

export const dynamic = 'force-dynamic'

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '12 meses' },
] as const

export default async function RastroPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>
}) {
  await exigirAdmin()
  const params = await searchParams
  const pedido = Number(params.dias)
  const dias = PERIODOS.some((p) => p.dias === pedido) ? pedido : 90

  // As filas de todas as etapas vêm de uma vez. São listas curtas, e assim
  // clicar num nó troca a lista na hora, sem nova ida ao banco.
  const [numeros, origens, ...listas] = await Promise.all([
    numerosDoFluxo(dias),
    porOrigem(dias),
    ...ETAPAS.filter((e) => e !== 'compra_concluida').map((e) =>
      paradosEm(e as Etapa, 24, 50),
    ),
  ])

  const filas = Object.fromEntries(
    ETAPAS.filter((e) => e !== 'compra_concluida').map((e, i) => [e, listas[i]]),
  )

  const pessoaIds = [
    ...new Set(
      Object.values(filas)
        .flat()
        .map((p) => p.pessoa_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const linhas = pessoaIds.length
    ? await getSql()<{ id: string; full_name: string | null }[]>`
        SELECT id, full_name FROM users WHERE id = ANY(${pessoaIds}::uuid[])
      `
    : []
  const nomes = Object.fromEntries(linhas.map((l) => [l.id, l.full_name]))

  return (
    <>
      <CabecaDePagina
        trilha="Comercial / Rastro"
        titulo="Fluxo ao vivo"
        acao={
          <div className="admin-periodo">
            {PERIODOS.map((p) => (
              <Link
                key={p.dias}
                href={`?dias=${p.dias}`}
                className={p.dias === dias ? 'ativo' : undefined}
              >
                {p.rotulo}
              </Link>
            ))}
          </div>
        }
      />

      <p className="admin-vazio-texto" style={{ margin: '0 0 18px', maxWidth: '72ch' }}>
        Onde cada pessoa está, e de onde ela veio. O que está marcado como{' '}
        <strong>medido</strong> é número real; <strong>cego</strong> é a etapa
        que existe e o sistema ainda não enxerga. Clique num nó para ver quem
        parou ali.
      </p>

      <Fluxo numeros={numeros} origens={origens} filas={filas} nomes={nomes} />
    </>
  )
}
