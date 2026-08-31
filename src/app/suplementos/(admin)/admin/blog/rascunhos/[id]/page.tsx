import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { Selo } from '@/components/admin/ui/Selo'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSqlConteudo } from '@/lib/conteudo/db'
import {
  aprovarAfirmacao,
  aprovarRascunho,
  publicarNoForm,
  rejeitarRascunho,
} from '../../actions'

export const dynamic = 'force-dynamic'

const ROTULO: Record<string, string> = {
  gerando: 'Escrevendo…',
  aguardando_revisao: 'Pronto pra revisão',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  publicado: 'Publicado',
  erro: 'Erro',
}

type Rascunho = {
  id: string
  title: string | null
  content_md: string | null
  status: string
}

/**
 * A afirmação e a fonte dela vêm num JOIN só, em linha plana. O trecho existe
 * quando `chunk_text` veio preenchido — é isso, e não a presença do id, que
 * diz se a fonte é real: o redator escreve o id à mão, e um id que não existe
 * na Biblioteca é exatamente o caso que a revisão precisa pegar.
 */
type Afirmacao = {
  id: string
  claim_text: string
  approved: boolean | null
  reviewer_note: string | null
  chunk_text: string | null
  episodio: string | null
  url: string | null
}

export default async function RascunhoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirAdmin()
  const { id } = await params
  const sql = getSqlConteudo()

  const [[rascunho], afirmacoes, [post]] = await Promise.all([
    sql<Rascunho[]>`
      SELECT id, title, content_md, status
      FROM blog_drafts WHERE id = ${id}::uuid
    `,
    sql<Afirmacao[]>`
      SELECT c.id, c.claim_text, c.approved, c.reviewer_note,
             ch.chunk_text,
             t.title AS episodio,
             t.source_url AS url
      FROM blog_draft_claims c
      LEFT JOIN blog_transcription_chunks ch ON ch.id = c.source_chunk_id
      LEFT JOIN blog_transcriptions t ON t.id = ch.transcription_id
      WHERE c.draft_id = ${id}::uuid
      ORDER BY c.created_at
    `,
    sql<{ slug: string }[]>`
      SELECT slug FROM blog_posts WHERE draft_id = ${id}::uuid
    `,
  ])
  if (!rascunho) notFound()

  const semFonte = afirmacoes.filter((a) => !a.chunk_text)
  const podeMexer = ['aguardando_revisao', 'aprovado', 'rejeitado'].includes(
    rascunho.status,
  )

  return (
    <>
      <CabecaDePagina
        trilha="Conteúdo / Blog / Rascunho"
        titulo={rascunho.title ?? 'Sem título'}
        acao={<Selo tom={rascunho.status === 'erro' ? 'perigo' : 'neutro'}>
          {ROTULO[rascunho.status] ?? rascunho.status}
        </Selo>}
      />

      <p className="admin-sub" style={{ marginBottom: 18 }}>
        <Link href="/suplementos/admin/blog">← Construtor do blog</Link>
      </p>

      {rascunho.status === 'gerando' && (
        <Card>
          <p className="admin-vazio-texto" style={{ margin: 0 }}>
            O agente ainda está escrevendo. Atualize a página em alguns
            instantes.
          </p>
        </Card>
      )}

      {semFonte.length > 0 && (
        <Card>
          <p className="admin-aviso" style={{ margin: 0 }}>
            {semFonte.length} afirmação(ões) citam um trecho que não existe na
            Biblioteca de Transcrições. Confira essas antes de aprovar.
          </p>
        </Card>
      )}

      {rascunho.content_md && (
        <Card rotulo="Texto">
          <article className="blog-leitura">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {rascunho.content_md}
            </ReactMarkdown>
          </article>
        </Card>
      )}

      {afirmacoes.length > 0 && (
        <Card rotulo={`Afirmações e fontes (${afirmacoes.length})`}>
          <div className="blog-afirmacoes">
            {afirmacoes.map((a) => (
              <div key={a.id} className="blog-afirmacao">
                <p className="admin-nome">“{a.claim_text}”</p>

                {a.chunk_text ? (
                  <div className="blog-fonte">
                    <p className="admin-campo-rotulo" style={{ marginBottom: 4 }}>
                      {a.episodio ?? 'Episódio'}
                      {a.url && (
                        <>
                          {' · '}
                          <a href={a.url} target="_blank" rel="noreferrer">
                            ver vídeo
                          </a>
                        </>
                      )}
                    </p>
                    <p className="admin-sub" style={{ margin: 0 }}>
                      {a.chunk_text}
                    </p>
                  </div>
                ) : (
                  <p className="admin-aviso">
                    Trecho citado não existe na Biblioteca.{' '}
                    {a.reviewer_note ?? ''}
                  </p>
                )}

                <div className="blog-afirmacao-acoes">
                  <form action={aprovarAfirmacao.bind(null, a.id, true, undefined)}>
                    <button
                      type="submit"
                      className={`admin-btn${a.approved === true ? ' admin-btn--primario' : ''}`}
                    >
                      Aprovar
                    </button>
                  </form>
                  <form action={aprovarAfirmacao.bind(null, a.id, false, undefined)}>
                    <button type="submit" className="admin-btn">
                      Reprovar
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {post && (
        <Card rotulo="No ar">
          <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="admin-nome">
            desafiodiabetes.com/blog/{post.slug}
          </a>
        </Card>
      )}

      {podeMexer && !post && (
        <Card>
          <div className="blog-decisao">
            {rascunho.status === 'aprovado' ? (
              <form action={publicarNoForm.bind(null, rascunho.id)}>
                <button type="submit" className="admin-btn admin-btn--primario">
                  Publicar no blog
                </button>
              </form>
            ) : (
              <form action={aprovarRascunho.bind(null, rascunho.id)}>
                <button type="submit" className="admin-btn admin-btn--primario">
                  Aprovar rascunho
                </button>
              </form>
            )}
            <form action={rejeitarRascunho.bind(null, rascunho.id)}>
              <button type="submit" className="admin-btn">
                Rejeitar
              </button>
            </form>
          </div>
          {semFonte.length > 0 && rascunho.status === 'aprovado' && (
            <p className="admin-aviso" style={{ marginTop: 14 }}>
              Ainda há {semFonte.length} afirmação(ões) sem fonte válida neste
              rascunho.
            </p>
          )}
        </Card>
      )}
    </>
  )
}
