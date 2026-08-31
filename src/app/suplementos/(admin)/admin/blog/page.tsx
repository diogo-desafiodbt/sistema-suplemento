import Link from 'next/link'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSqlConteudo } from '@/lib/conteudo/db'
import { gerarRascunho } from './actions'

export const dynamic = 'force-dynamic'

type Tema = {
  id: string
  theme: string
  cluster: string | null
  priority: number | null
  target_keywords: string[] | null
}

type Rascunho = {
  id: string
  title: string | null
  status: string
  created_at: string
  theme_name: string | null
  afirmacoes: number
  sem_fonte: number
}

const ROTULO: Record<string, string> = {
  gerando: 'Escrevendo…',
  aguardando_revisao: 'Pronto pra revisão',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  publicado: 'Publicado',
  erro: 'Erro',
}

const TOM: Record<string, 'ok' | 'atencao' | 'perigo' | 'neutro'> = {
  gerando: 'atencao',
  aguardando_revisao: 'atencao',
  aprovado: 'ok',
  publicado: 'ok',
  rejeitado: 'neutro',
  erro: 'perigo',
}

export default async function BlogAdminPage() {
  await exigirAdmin()
  const sql = getSqlConteudo()

  const [temas, rascunhos, publicados] = await Promise.all([
    sql<Tema[]>`
      SELECT id, theme, cluster, priority, target_keywords
      FROM blog_theme_backlog
      WHERE status = 'disponivel'
      ORDER BY priority DESC NULLS LAST
      LIMIT 20
    `,
    // A contagem de afirmações sem fonte entra já na lista: é o número que
    // decide se vale abrir o rascunho, e vê-lo só lá dentro obrigaria a abrir
    // um por um para descobrir qual precisa de atenção.
    sql<Rascunho[]>`
      SELECT d.id, d.title, d.status, d.created_at,
             t.theme AS theme_name,
             COUNT(c.id)::int AS afirmacoes,
             COUNT(c.id) FILTER (WHERE c.source_chunk_id IS NULL)::int AS sem_fonte
      FROM blog_drafts d
      LEFT JOIN blog_theme_backlog t ON t.id = d.theme_id
      LEFT JOIN blog_draft_claims c ON c.draft_id = d.id
      GROUP BY d.id, d.title, d.status, d.created_at, t.theme
      ORDER BY d.created_at DESC
      LIMIT 20
    `,
    sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM blog_posts WHERE status = 'publicado'
    `,
  ])

  return (
    <>
      <CabecaDePagina
        trilha="Conteúdo / Blog"
        titulo="Construtor do blog"
        acao={
          <a
            href="/blog"
            target="_blank"
            rel="noreferrer"
            className="admin-btn"
          >
            Ver o blog
          </a>
        }
      />

      <Card rotulo={`Fila de temas (${temas.length})`}>
        {temas.length === 0 ? (
          <p className="admin-vazio-texto">
            Nenhum tema na fila. Por enquanto os temas entram à mão — o agente
            que os pesquisa sozinho ainda não tem gatilho.
          </p>
        ) : (
          <table className="admin-tabela">
            <thead>
              <tr>
                <th>Tema</th>
                <th>Palavras-chave</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {temas.map((tema) => (
                <tr key={tema.id}>
                  <td>
                    <span className="admin-nome">{tema.theme}</span>
                    {tema.cluster && (
                      <p className="admin-sub">
                        {tema.cluster} · prioridade {tema.priority ?? 0}
                      </p>
                    )}
                  </td>
                  <td className="admin-sub">
                    {tema.target_keywords?.slice(0, 3).join(', ') || '—'}
                  </td>
                  <td>
                    <form action={gerarRascunho.bind(null, tema.id)}>
                      <button type="submit" className="admin-btn admin-btn--primario">
                        Escrever
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card rotulo={`Rascunhos (${rascunhos.length})`}>
        {rascunhos.length === 0 ? (
          <p className="admin-vazio-texto">Nenhum rascunho ainda.</p>
        ) : (
          <table className="admin-tabela">
            <thead>
              <tr>
                <th>Título</th>
                <th>Afirmações</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rascunhos.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={`/suplementos/admin/blog/rascunhos/${r.id}`}
                      className="admin-nome"
                    >
                      {r.title ?? r.theme_name ?? 'Sem título'}
                    </Link>
                    <p className="admin-sub">
                      {new Date(r.created_at).toLocaleString('pt-BR')}
                    </p>
                  </td>
                  <td>
                    {r.afirmacoes === 0 ? (
                      <span className="admin-sub">—</span>
                    ) : r.sem_fonte > 0 ? (
                      <Selo tom="perigo">
                        {r.sem_fonte} de {r.afirmacoes} sem fonte
                      </Selo>
                    ) : (
                      <span className="admin-mono">
                        {r.afirmacoes} · todas com fonte
                      </span>
                    )}
                  </td>
                  <td>
                    <Selo tom={TOM[r.status] ?? 'neutro'}>
                      {ROTULO[r.status] ?? r.status}
                    </Selo>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card rotulo="No ar">
        <p className="admin-vazio-texto" style={{ margin: 0 }}>
          {publicados[0]?.n === 0
            ? 'Nenhum post publicado ainda. O blog está no ar e vazio.'
            : `${publicados[0]?.n} post(s) publicado(s) em desafiodiabetes.com/blog.`}
        </p>
      </Card>
    </>
  )
}
