import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { CopyButton } from '@/components/CopyButton'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSql } from '@/lib/db'
import { episodios } from '@/lib/rastro/episodios'
import { FormularioLink } from './FormularioLink'
import { apagarLink, criarLinkDeEpisodio } from './actions'

export const dynamic = 'force-dynamic'

const SITE = 'https://desafiodiabetes.com'

type Link = {
  apelido: string
  destino: string
  descricao: string | null
  visitas: number
}

export default async function LinksPage() {
  await exigirAdmin()

  // A contagem vem do Rastro, não de um contador próprio: quem visitou com
  // este apelido é o número que interessa, e ele já está gravado.
  const links = await getSql()<Link[]>`
    SELECT l.apelido, l.destino, l.descricao,
           COUNT(DISTINCT e.anonimo_id)::int AS visitas
    FROM rastro_links l
    LEFT JOIN rastro_eventos e ON e.origem = l.apelido
    GROUP BY l.apelido, l.destino, l.descricao, l.criado_em
    ORDER BY l.criado_em DESC
  `

  // Os episódios que ainda não viraram link. Some da lista assim que o link
  // existe, para a tela ir esvaziando conforme ele avança pelos vídeos.
  let semLink: Awaited<ReturnType<typeof episodios>> = []
  try {
    const todos = await episodios()
    const jaTem = new Set(links.map((l) => l.apelido))
    semLink = todos.filter((e) => !jaTem.has(e.apelido))
  } catch (erro) {
    // A Biblioteca vive noutro banco. Se ela não responder, o resto da tela
    // continua servindo — criar link à mão nunca depende dela.
    console.error('rastro: não listou episódios', erro)
  }

  return (
    <>
      <CabecaDePagina trilha="Comercial / Rastro" titulo="Links de origem" />

      <Card rotulo="Novo link">
        <p className="admin-vazio-texto" style={{ margin: '0 0 18px', maxWidth: '64ch' }}>
          O apelido é o que aparece no relatório de origem. Use um por lugar
          onde o link vai morar — descrição de vídeo, bio do Instagram,
          mensagem no grupo — senão os três viram uma linha só e não dá para
          saber qual funcionou. O destino pode ser um caminho do site ou o
          checkout do guia na Hotmart; o construtor põe o parâmetro que cada
          um entende.
        </p>
        <FormularioLink />
      </Card>

      <Card rotulo={`Episódios sem link (${semLink.length})`}>
        {semLink.length === 0 ? (
          <p className="admin-vazio-texto">
            Todos os episódios da Biblioteca já têm link.
          </p>
        ) : (
          <>
            <p className="admin-vazio-texto" style={{ margin: '0 0 18px', maxWidth: '64ch' }}>
              Um link por vídeo. O apelido sai do título do episódio, e o
              destino é a página de vendas — é ela que repassa a origem para a
              Hotmart quando a pessoa clica em comprar.
            </p>
            <table className="admin-tabela">
              <thead>
                <tr>
                  <th>Episódio</th>
                  <th>Apelido que vai receber</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {semLink.map((e) => (
                  <tr key={e.apelido}>
                    <td>
                      {e.url ? (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-nome"
                        >
                          {e.titulo}
                        </a>
                      ) : (
                        <span className="admin-nome">{e.titulo}</span>
                      )}
                    </td>
                    <td className="admin-mono">{e.apelido}</td>
                    <td>
                      <form action={criarLinkDeEpisodio.bind(null, e.apelido, e.titulo)}>
                        <button type="submit" className="admin-btn">
                          Criar link
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card rotulo={`Links criados (${links.length})`}>
        {links.length === 0 ? (
          <p className="admin-vazio-texto">Nenhum link ainda.</p>
        ) : (
          <table className="admin-tabela">
            <thead>
              <tr>
                <th>Apelido</th>
                <th>Endereço para colar</th>
                <th>Visitas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                // A Hotmart entende `src`; o nosso site entende `o`. Mesmo
                // apelido nos dois, para o relatório juntar as duas pontas.
                const externo = l.destino.startsWith('https://')
                const base = externo ? l.destino : `${SITE}${l.destino}`
                const parametro = externo ? 'src' : 'o'
                const url = `${base}${base.includes('?') ? '&' : '?'}${parametro}=${l.apelido}`
                return (
                  <tr key={l.apelido}>
                    <td>
                      <span className="admin-nome">{l.apelido}</span>
                      {l.descricao && <p className="admin-sub">{l.descricao}</p>}
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="admin-mono">{url}</span>
                        <CopyButton value={url} label="Copiar" />
                      </span>
                    </td>
                    <td className="admin-mono">{l.visitas}</td>
                    <td>
                      <form action={apagarLink.bind(null, l.apelido)}>
                        <button type="submit" className="admin-btn">
                          Apagar
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
