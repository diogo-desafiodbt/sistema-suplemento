import Link from 'next/link'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSql } from '@/lib/db'
import { type Etapa, ETAPAS, funil, paradosEm, porOrigem } from '@/lib/rastro/consultas'

export const dynamic = 'force-dynamic'

const NOME_DA_ETAPA: Record<string, string> = {
  visita: 'Chegou no site',
  triagem_iniciada: 'Começou a triagem',
  triagem_respondida: 'Respondeu a triagem',
  triagem_concluida: 'Terminou a triagem',
  checkout_iniciado: 'Abriu o checkout',
  compra_concluida: 'Comprou',
}

const PERIODOS = [7, 30, 90] as const

function horasEmTexto(horas: number): string {
  if (horas < 48) return `${horas} h`
  return `${Math.floor(horas / 24)} dias`
}

export default async function RastroPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; parados?: string }>
}) {
  await exigirAdmin()
  const params = await searchParams

  const dias = PERIODOS.includes(Number(params.dias) as (typeof PERIODOS)[number])
    ? Number(params.dias)
    : 30
  const etapaDaFila: Etapa = ETAPAS.includes(params.parados as Etapa)
    ? (params.parados as Etapa)
    : 'triagem_concluida'

  const [etapas, origens, parados] = await Promise.all([
    funil(dias),
    porOrigem(dias),
    paradosEm(etapaDaFila, 24, 50),
  ])

  // Quem tem conta aparece pelo nome; quem ainda não tem aparece como
  // visitante. Os dois na mesma fila de propósito: quem parou antes de criar
  // conta é exatamente quem a gente mais perde de vista hoje.
  const pessoaIds = [...new Set(parados.map((p) => p.pessoa_id).filter(Boolean))]
  const nomes = pessoaIds.length
    ? await getSql()<{ id: string; full_name: string | null }[]>`
        SELECT id, full_name FROM users WHERE id = ANY(${pessoaIds}::uuid[])
      `
    : []
  const nomePorId = new Map(nomes.map((n) => [n.id, n.full_name]))

  const maior = Math.max(...etapas.map((e) => e.pessoas), 1)
  const chegaramTotal = origens.reduce((s, o) => s + o.chegaram, 0)

  return (
    <>
      <CabecaDePagina
        trilha="Comercial / Rastro"
        titulo="Jornada do cliente"
        acao={
          <div className="admin-periodo">
            {PERIODOS.map((p) => (
              <Link
                key={p}
                href={`?dias=${p}&parados=${etapaDaFila}`}
                className={p === dias ? 'ativo' : undefined}
              >
                {p} dias
              </Link>
            ))}
          </div>
        }
      />

      <Card rotulo="Onde as pessoas param">
        {chegaramTotal === 0 ? (
          <p className="admin-vazio-texto">
            Ainda não há visita registrada nesta janela. O primeiro passo entra
            quando alguém abre uma página pública.
          </p>
        ) : (
          <ul className="rastro-funil">
            {etapas.map((e, i) => {
              const anterior = i > 0 ? etapas[i - 1].pessoas : null
              const perda =
                anterior && anterior > 0
                  ? Math.round((1 - e.pessoas / anterior) * 100)
                  : null
              return (
                <li key={e.evento} className="rastro-etapa">
                  <div className="rastro-etapa-topo">
                    <span className="admin-nome">
                      {NOME_DA_ETAPA[e.evento] ?? e.evento}
                    </span>
                    <span className="admin-mono">{e.pessoas}</span>
                  </div>
                  <div
                    className="rastro-barra"
                    style={{ width: `${Math.max((e.pessoas / maior) * 100, 1.5)}%` }}
                  />
                  {perda !== null && perda > 0 && (
                    <p className="admin-sub">perdeu {perda}% da etapa anterior</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card
        rotulo="De onde veio quem comprou"
        verHref="/suplementos/admin/rastro/links"
        verTexto="Criar links"
      >
        {origens.length === 0 ? (
          <p className="admin-vazio-texto">
            Nada registrado ainda. A origem entra quando o link tem{' '}
            <code className="admin-mono">?o=apelido</code> no fim.
          </p>
        ) : (
          <table className="admin-tabela">
            <thead>
              <tr>
                <th>Origem</th>
                <th>Chegaram</th>
                <th>Compraram</th>
                <th>Conversão</th>
              </tr>
            </thead>
            <tbody>
              {origens.map((o) => (
                <tr key={o.origem}>
                  <td className="admin-nome">{o.origem}</td>
                  <td className="admin-mono">{o.chegaram}</td>
                  <td className="admin-mono">{o.compraram}</td>
                  <td className="admin-mono">
                    {o.chegaram > 0
                      ? `${((o.compraram / o.chegaram) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        rotulo="Parou e não voltou"
        verHref={`/suplementos/admin/rastro?dias=${dias}&parados=checkout_iniciado`}
        verTexto="Ver quem abriu o checkout"
      >
        <div className="admin-periodo" style={{ marginBottom: 16 }}>
          {ETAPAS.filter((e) => e !== 'compra_concluida').map((e) => (
            <Link
              key={e}
              href={`?dias=${dias}&parados=${e}`}
              className={e === etapaDaFila ? 'ativo' : undefined}
            >
              {NOME_DA_ETAPA[e]}
            </Link>
          ))}
        </div>

        {parados.length === 0 ? (
          <p className="admin-vazio-texto">
            Ninguém parado nesta etapa há mais de 24 horas.
          </p>
        ) : (
          <table className="admin-tabela">
            <thead>
              <tr>
                <th>Quem</th>
                <th>Origem</th>
                <th>Parado há</th>
              </tr>
            </thead>
            <tbody>
              {parados.map((p) => (
                <tr key={p.anonimo_id}>
                  <td>
                    {p.pessoa_id ? (
                      <Link
                        href={`/suplementos/admin/clientes/${p.pessoa_id}`}
                        className="admin-nome"
                      >
                        {nomePorId.get(p.pessoa_id) ?? 'Cliente'}
                      </Link>
                    ) : (
                      <Selo tom="neutro">visitante sem conta</Selo>
                    )}
                  </td>
                  <td className="admin-sub">{p.origem ?? 'direto'}</td>
                  <td className="admin-mono">{horasEmTexto(p.horas_parado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
