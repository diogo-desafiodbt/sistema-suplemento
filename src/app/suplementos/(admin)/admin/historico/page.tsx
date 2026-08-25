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
  quantos: number
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function HistoricoPage() {
  const sql = getSql()

  const dias = await sql<Dia[]>`
    SELECT quando::date::text AS dia,
           count(*) FILTER (WHERE tipo = 'commit')            AS commits,
           count(*) FILTER (WHERE tipo IN ('deploy','build')) AS publicacoes,
           coalesce(sum(coalesce(inseridas,0) + coalesce(removidas,0)), 0) AS linhas
      FROM dev_evento
     GROUP BY 1 ORDER BY 1
  `

  const itens = await sql<Item[]>`
    SELECT quando::date::text AS dia, tipo, projeto,
           CASE WHEN tipo = 'commit' THEN titulo ELSE NULL END AS titulo,
           count(*)::int AS quantos
      FROM dev_evento
     GROUP BY 1,2,3,4
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

  const fmt = (s: string) =>
    s
      ? new Date(s + 'T12:00:00Z').toLocaleDateString('pt-BR', {
          day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
        })
      : ''

  // A série usa TODOS os dias corridos, não só os que tiveram atividade: uma
  // semana parada precisa aparecer como linha no chão. É o vazio entre os
  // picos que mostra o ritmo — se o eixo pulasse os dias vazios, um mês de
  // pausa ficaria do mesmo tamanho de um dia.
  const serie: { dia: string; valor: number }[] = []
  if (dias.length) {
    const cursor = new Date(dias[0]!.dia + 'T12:00:00Z')
    const ate = new Date(dias[dias.length - 1]!.dia + 'T12:00:00Z')
    while (cursor <= ate) {
      const chave = ymd(cursor)
      serie.push({ dia: chave, valor: Number(porDia.get(chave)?.linhas ?? 0) })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }

  // Média de 7 dias. O dia a dia é dente de serra — um commit grande faz um
  // pico de 20 mil linhas encostado num zero. A média é o que torna a
  // evolução legível, que é o ponto do gráfico.
  const media = serie.map((_, i) => {
    const janela = serie.slice(Math.max(0, i - 6), i + 1)
    return janela.reduce((a, p) => a + p.valor, 0) / janela.length
  })

  const L = 980
  const A = 250
  const PAD = { e: 56, d: 16, t: 16, b: 30 }
  const larg = L - PAD.e - PAD.d
  const alt = A - PAD.t - PAD.b
  const topo = Math.max(1, ...serie.map((p) => p.valor))
  const x = (i: number) =>
    PAD.e + (serie.length < 2 ? 0 : (i * larg) / (serie.length - 1))
  const y = (v: number) => PAD.t + alt - (v / topo) * alt

  const area =
    serie.length > 1
      ? `M ${x(0)} ${y(0)} ${serie
          .map((p, i) => `L ${x(i)} ${y(p.valor)}`)
          .join(' ')} L ${x(serie.length - 1)} ${y(0)} Z`
      : ''
  const linhaMedia =
    serie.length > 1
      ? serie
          .map((_, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(media[i]!)}`)
          .join(' ')
      : ''

  const meses: { i: number; texto: string }[] = []
  serie.forEach((p, i) => {
    const mes = p.dia.slice(0, 7)
    if (!meses.some((m) => serie[m.i]!.dia.slice(0, 7) === mes)) {
      meses.push({
        i,
        texto: new Date(p.dia + 'T12:00:00Z').toLocaleDateString('pt-BR', {
          month: 'short', timeZone: 'UTC',
        }),
      })
    }
  })

  const diasDaLinha = [...new Set(itens.map((i) => i.dia))]

  return (
    <div className="historia">
      <header className="admin-cabeca">
        <div>
          <p className="admin-cabeca-trilha">Ajustes</p>
          <h1 className="admin-cabeca-titulo">Histórico de desenvolvimento</h1>
        </div>
      </header>

      <section className="historia-numeros">
        <div><b>{totais.commits}</b><span>commits</span></div>
        <div><b>{totais.publicacoes}</b><span>publicações</span></div>
        <div><b>{totais.linhas.toLocaleString('pt-BR')}</b><span>linhas mexidas</span></div>
      </section>

      <section className="historia-grafico-caixa">
        <div className="historia-grafico-topo">
          <h2>Intensidade de desenvolvimento</h2>
          <span>linhas mexidas por dia · a linha cheia é a média de 7 dias</span>
        </div>

        <svg
          className="historia-grafico"
          viewBox={`0 0 ${L} ${A}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Evolução da intensidade de desenvolvimento de ${fmt(serie[0]?.dia ?? '')} até ${fmt(serie[serie.length - 1]?.dia ?? '')}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} className="historia-grade"
                  x1={PAD.e} x2={L - PAD.d} y1={y(topo * f)} y2={y(topo * f)} />
          ))}
          {[0, 0.5, 1].map((f) => (
            <text key={f} className="historia-eixo-y" x={PAD.e - 10} y={y(topo * f) + 4}>
              {Math.round(topo * f).toLocaleString('pt-BR')}
            </text>
          ))}
          {area && <path d={area} className="historia-area" />}
          {linhaMedia && <path d={linhaMedia} className="historia-media" />}
          {meses.map((m) => (
            <text key={m.i} className="historia-eixo-x" x={x(m.i)} y={A - 10}>
              {m.texto}
            </text>
          ))}
          {serie.map((p, i) =>
            p.valor > 0 ? (
              <circle key={p.dia} className="historia-ponto"
                      cx={x(i)} cy={y(p.valor)} r={2.5}>
                <title>{`${fmt(p.dia)} — ${p.valor.toLocaleString('pt-BR')} linhas`}</title>
              </circle>
            ) : null,
          )}
        </svg>

        <p className="historia-grafico-pe">
          Começa em {fmt(serie[0]?.dia ?? '')}, no primeiro commit da LP do
          Primeiro Passo, e vai até hoje.
        </p>
      </section>

      <section className="historia-linha">
        {diasDaLinha.map((dia) => {
          const doDia = itens.filter((i) => i.dia === dia)
          const commits = doDia.filter((i) => i.tipo === 'commit')
          const nPubs = doDia
            .filter((i) => i.tipo === 'deploy' || i.tipo === 'build')
            .reduce((a, p) => a + p.quantos, 0)
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
