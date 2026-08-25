import { getSql } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Dia = {
  dia: string
  commits: number
  publicacoes: number
  linhas: number
}

type Item = {
  dia: string
  tipo: string
  projeto: string
  titulo: string | null
  ambiente: string | null
  status: string | null
  quantos: number
}

// A intensidade de um dia não é o número de commits: um commit de 3 mil linhas
// e um de duas não são o mesmo dia de trabalho. A escala é logarítmica porque
// os picos são muito altos — 12/08 teve 20 mil linhas, e numa escala linear
// ele achataria todos os outros dias em cinza.
function nivel(linhas: number, commits: number): number {
  const peso = linhas + commits * 40
  if (peso === 0) return 0
  if (peso < 200) return 1
  if (peso < 900) return 2
  if (peso < 3000) return 3
  return 4
}

const CORES = [
  'var(--historia-0)',
  'var(--historia-1)',
  'var(--historia-2)',
  'var(--historia-3)',
  'var(--historia-4)',
]

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function HistoricoPage() {
  const sql = getSql()

  const dias = await sql<Dia[]>`
    SELECT quando::date::text AS dia,
           count(*) FILTER (WHERE tipo = 'commit')                 AS commits,
           count(*) FILTER (WHERE tipo IN ('deploy','build'))      AS publicacoes,
           coalesce(sum(coalesce(inseridas,0) + coalesce(removidas,0)), 0) AS linhas
      FROM dev_evento
     GROUP BY 1 ORDER BY 1
  `

  const itens = await sql<Item[]>`
    SELECT quando::date::text AS dia, tipo, projeto,
           CASE WHEN tipo = 'commit' THEN titulo ELSE NULL END AS titulo,
           ambiente, status, count(*)::int AS quantos
      FROM dev_evento
     GROUP BY 1,2,3,4,5,6, CASE WHEN tipo='commit' THEN titulo ELSE NULL END
     ORDER BY dia DESC, tipo
  `

  const porDia = new Map(dias.map((d) => [d.dia, d]))
  const totais = dias.reduce(
    (a, d) => ({
      commits: a.commits + Number(d.commits),
      publicacoes: a.publicacoes + Number(d.publicacoes),
      linhas: a.linhas + Number(d.linhas),
    }),
    { commits: 0, publicacoes: 0, linhas: 0 },
  )

  // O calendário começa no domingo da semana do primeiro dia, senão as colunas
  // saem desalinhadas do dia da semana.
  const primeiro = dias.length ? new Date(dias[0]!.dia + 'T12:00:00Z') : new Date()
  const ultimo = dias.length ? new Date(dias[dias.length - 1]!.dia + 'T12:00:00Z') : new Date()
  const inicio = new Date(primeiro)
  inicio.setUTCDate(inicio.getUTCDate() - inicio.getUTCDay())

  const semanas: { dia: string; n: number; d?: Dia }[][] = []
  const cursor = new Date(inicio)
  while (cursor <= ultimo) {
    const semana: { dia: string; n: number; d?: Dia }[] = []
    for (let i = 0; i < 7; i++) {
      const chave = ymd(cursor)
      const d = porDia.get(chave)
      semana.push({
        dia: chave,
        n: d ? nivel(Number(d.linhas), Number(d.commits)) : 0,
        d,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    semanas.push(semana)
  }

  const diasDaLinha = [...new Set(itens.map((i) => i.dia))]
  const fmt = (s: string) =>
    new Date(s + 'T12:00:00Z').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    })

  return (
    <div className="historia">
      <header className="admin-cabeca">
        <div>
          <p className="admin-cabeca-trilha">Ajustes</p>
          <h1 className="admin-cabeca-titulo">Histórico de desenvolvimento</h1>
        </div>
      </header>

      <section className="historia-numeros">
        <div><b>{dias.length}</b><span>dias de trabalho</span></div>
        <div><b>{totais.commits}</b><span>commits</span></div>
        <div><b>{totais.publicacoes}</b><span>publicações</span></div>
        <div><b>{totais.linhas.toLocaleString('pt-BR')}</b><span>linhas mexidas</span></div>
      </section>

      <section className="historia-mapa-caixa">
        <div className="historia-mapa" role="img"
             aria-label={`Intensidade de desenvolvimento por dia, de ${fmt(dias[0]?.dia ?? '')} até ${fmt(dias[dias.length-1]?.dia ?? '')}`}>
          {semanas.map((semana, i) => (
            <div className="historia-semana" key={i}>
              {semana.map((c) => (
                <div
                  key={c.dia}
                  className="historia-celula"
                  style={{ background: CORES[c.n] }}
                  title={
                    c.d
                      ? `${fmt(c.dia)} — ${c.d.commits} commits, ${c.d.publicacoes} publicações, ${Number(c.d.linhas).toLocaleString('pt-BR')} linhas`
                      : `${fmt(c.dia)} — sem atividade`
                  }
                />
              ))}
            </div>
          ))}
        </div>
        <p className="historia-legenda">
          <span>menos</span>
          {CORES.map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
          <span>mais</span>
        </p>
      </section>

      <section className="historia-linha">
        {diasDaLinha.map((dia) => {
          const doDia = itens.filter((i) => i.dia === dia)
          const commits = doDia.filter((i) => i.tipo === 'commit')
          const pubs = doDia.filter((i) => i.tipo === 'deploy' || i.tipo === 'build')
          const nPubs = pubs.reduce((a, p) => a + p.quantos, 0)
          const resumo = porDia.get(dia)
          return (
            <article className="historia-dia" key={dia}>
              <div className="historia-dia-topo">
                <h2>{fmt(dia)}</h2>
                <span>
                  {nPubs > 0 && `${nPubs} publicaç${nPubs === 1 ? 'ão' : 'ões'} · `}
                  {Number(resumo?.linhas ?? 0).toLocaleString('pt-BR')} linhas
                </span>
              </div>
              <ul>
                {commits.map((c, i) => (
                  <li key={`c${i}`}>
                    <span className="historia-marca" data-projeto={c.projeto} />
                    {c.titulo}
                  </li>
                ))}
                {commits.length === 0 && nPubs > 0 && (
                  <li className="historia-sopub">
                    Publicação sem commit novo — configuração ou republicação.
                  </li>
                )}
              </ul>
            </article>
          )
        })}
      </section>
    </div>
  )
}
