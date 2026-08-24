import { getSql } from '@/lib/db'
import { getSqlConteudo } from '@/lib/conteudo/db'

/** Canal oficial — só o ID de ambiente, nunca um handle inventado. */
function linkDoCanal(): string | null {
  const id = process.env.YOUTUBE_CHANNEL_ID?.trim()
  if (!id) return null
  return `https://www.youtube.com/channel/${id}`
}

async function registrarLeitura(params: {
  threadId: string
  userId: string | null
  campos: string[]
}): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO support_access_log (thread_id, user_id, ator, ferramenta, campos)
    VALUES (
      ${params.threadId}::uuid,
      ${params.userId}::uuid,
      'ia',
      'buscar_conteudo',
      ${sql.array(params.campos)}
    )
  `
}

async function buscarAula(pergunta: string): Promise<{
  titulo: string
  url: string
} | null> {
  const sql = getSqlConteudo()
  const rows = await sql<
    {
      titulo: string | null
      url: string | null
      inicio_seg: number | null
    }[]
  >`
    SELECT titulo, url, inicio_seg
    FROM buscar_aula(${pergunta})
  `
  const primeiro = rows[0]
  if (!primeiro?.titulo || !primeiro.url) return null
  const inicio = primeiro.inicio_seg ?? 0
  return {
    titulo: primeiro.titulo,
    url: comTimestamp(primeiro.url, inicio),
  }
}

/**
 * As 2.583 URLs do acervo são `https://youtu.be/ID`, sem query string —
 * conferido no banco: zero com `?`. Emendar `&t=` numa URL sem `?` produz
 * `youtu.be/ID&t=486`, que é malformado: `?` é o que inicia a query.
 *
 * Medido em 24/08: o YouTube é tolerante e ainda abre o vídeo certo nas
 * duas formas — então NÃO é link quebrado, como eu supus a princípio. O que
 * não consegui confirmar é se o segundo é respeitado na forma torta, e é
 * justamente o segundo que dá sentido a apontar o trecho em vez do vídeo
 * inteiro. Na dúvida, usar a forma correta, que é gratuita.
 */
function comTimestamp(url: string, segundo: number): string {
  if (segundo <= 0) return url
  const separador = url.includes('?') ? '&' : '?'
  return `${url}${separador}t=${segundo}`
}

/** Sem nome, a saudação fica sem vocativo — "Bom dia, olá!" não existe. */
function saudacao(nome: string | null | undefined): string {
  const pedaco = nome?.trim().split(/\s+/)[0]
  return pedaco ? `Bom dia, ${pedaco}!` : 'Bom dia!'
}

function modeloComAula(params: {
  saudacao: string
  titulo: string
  url: string
}): string {
  return `${params.saudacao}

O Dr. Turí falou sobre isso nesta aula:
${params.titulo}
${params.url}

Equipe Desafio Diabetes`
}

function modeloCanalGeral(params: {
  saudacao: string
  linkCanal: string | null
}): string {
  if (params.linkCanal) {
    return `${params.saudacao}

O Dr. Turí responde dúvidas como a sua no canal do Desafio Diabetes:
${params.linkCanal}

Equipe Desafio Diabetes`
  }
  return `${params.saudacao}

O Dr. Turí responde dúvidas como a sua no canal do Desafio Diabetes no YouTube — busque pelo tema lá. Não encontrei uma aula específica no acervo para apontar com segurança.

Equipe Desafio Diabetes`
}

export type RespostaTecnica = {
  /** Texto do modelo fixo — nenhuma frase escrita pela IA. */
  texto: string
  /** true se veio aula concreta do acervo. */
  comAula: boolean
  titulo: string | null
  url: string | null
}

/**
 * Categoria `tecnico`: modelo fixo em código. A IA não redige.
 * Quem protege é a categoria da triagem — a nota da busca não separa
 * pergunta clínica de logística.
 */
export async function responderTecnico(params: {
  threadId: string
  userId: string | null
  pergunta: string
  nomeCliente?: string | null
}): Promise<RespostaTecnica> {
  const abertura = saudacao(params.nomeCliente)
  const aula = await buscarAula(params.pergunta)

  await registrarLeitura({
    threadId: params.threadId,
    userId: params.userId,
    campos: ['titulo', 'url', 'inicio_seg'],
  })

  if (aula) {
    return {
      texto: modeloComAula({
        saudacao: abertura,
        titulo: aula.titulo,
        url: aula.url,
      }),
      comAula: true,
      titulo: aula.titulo,
      url: aula.url,
    }
  }

  return {
    texto: modeloCanalGeral({
      saudacao: abertura,
      linkCanal: linkDoCanal(),
    }),
    comAula: false,
    titulo: null,
    url: linkDoCanal(),
  }
}
