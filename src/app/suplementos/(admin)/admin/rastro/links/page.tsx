import { CabecaDePagina } from '@/components/admin/CabecaDePagina'
import { Card } from '@/components/admin/ui/Card'
import { CopyButton } from '@/components/CopyButton'
import { exigirAdmin } from '@/lib/auth/admin'
import { getSql } from '@/lib/db'
import { FormularioLink } from './FormularioLink'
import { apagarLink } from './actions'

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

  return (
    <>
      <CabecaDePagina trilha="Comercial / Rastro" titulo="Links de origem" />

      <Card rotulo="Novo link">
        <p className="admin-vazio-texto" style={{ margin: '0 0 18px', maxWidth: '64ch' }}>
          O apelido é o que aparece no relatório de origem. Use um por lugar
          onde o link vai morar — descrição de vídeo, bio do Instagram,
          mensagem no grupo — senão os três viram uma linha só e não dá para
          saber qual funcionou.
        </p>
        <FormularioLink />
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
                const url = `${SITE}${l.destino}${l.destino.includes('?') ? '&' : '?'}o=${l.apelido}`
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
