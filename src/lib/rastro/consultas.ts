// Leitura do Rastro. Roda no núcleo, como `app_web` — a decisão de Zona 1
// diz que a tela do fluxo e a fila de contato são telas do núcleo, não
// satélite, porque mostram pessoa e etapas de um produto de saúde.
//
// As quatro perguntas que o Rastro existe para responder:
// onde as pessoas param, de onde veio quem compra, o que uma pessoa fez, e
// quem está parado agora e vale um contato.

import { getSqlConteudo } from '@/lib/conteudo/db'
import { getSql } from '@/lib/db'

/** A ordem do funil. O que não está aqui não aparece na contagem por etapa. */
export const ETAPAS = [
  'visita',
  'triagem_iniciada',
  'triagem_respondida',
  'triagem_concluida',
  'checkout_iniciado',
  'compra_concluida',
] as const

export type Etapa = (typeof ETAPAS)[number]

export type ContagemEtapa = { evento: string; pessoas: number }

/**
 * Quantos navegadores distintos chegaram a cada etapa na janela.
 *
 * Conta navegador, não evento: quem começa a triagem três vezes é uma pessoa
 * hesitando, não três pessoas. Contar evento infla justamente as etapas em
 * que a gente mais quer confiar no número.
 */
export async function funil(dias = 30): Promise<ContagemEtapa[]> {
  const linhas = await getSql()<ContagemEtapa[]>`
    SELECT evento, COUNT(DISTINCT anonimo_id)::int AS pessoas
    FROM rastro_eventos
    WHERE ocorrido_em > now() - make_interval(days => ${dias})
    GROUP BY evento
  `
  const porNome = new Map(linhas.map((l) => [l.evento, l.pessoas]))
  return ETAPAS.map((e) => ({ evento: e, pessoas: porNome.get(e) ?? 0 }))
}

export type Origem = {
  origem: string
  chegaram: number
  compraram: number
}

/**
 * De onde veio quem comprou.
 *
 * A origem fica no primeiro evento do navegador, não no último: o crédito é
 * de quem trouxe a pessoa, e a última visita antes da compra costuma ser ela
 * digitando o endereço direto — o que atribuiria toda venda ao "direto" e
 * apagaria o vídeo que fez o trabalho.
 */
export async function porOrigem(dias = 30): Promise<Origem[]> {
  return await getSql()<Origem[]>`
    WITH primeira AS (
      SELECT DISTINCT ON (anonimo_id)
             anonimo_id, COALESCE(origem, 'direto') AS origem
      FROM rastro_eventos
      WHERE ocorrido_em > now() - make_interval(days => ${dias})
      ORDER BY anonimo_id, ocorrido_em
    ),
    comprou AS (
      SELECT DISTINCT anonimo_id FROM rastro_eventos
      WHERE evento = 'compra_concluida'
        AND ocorrido_em > now() - make_interval(days => ${dias})
    )
    SELECT p.origem,
           COUNT(*)::int AS chegaram,
           COUNT(c.anonimo_id)::int AS compraram
    FROM primeira p
    LEFT JOIN comprou c ON c.anonimo_id = p.anonimo_id
    GROUP BY p.origem
    ORDER BY compraram DESC, chegaram DESC
  `
}

export type PassoDaJornada = {
  evento: string
  origem: string | null
  ocorrido_em: string
  anonimo_id: string
}

/**
 * A jornada de uma pessoa, em ordem.
 *
 * Alcança os eventos anteriores ao login pela tabela de ligação, e junta os
 * vários navegadores da mesma pessoa — celular e computador são a mesma
 * pessoa, e uma jornada partida em dois não conta a história.
 */
export async function jornadaDaPessoa(
  pessoaId: string,
): Promise<PassoDaJornada[]> {
  return await getSql()<PassoDaJornada[]>`
    SELECT evento, origem, ocorrido_em, anonimo_id
    FROM rastro_eventos
    WHERE pessoa_id = ${pessoaId}::uuid
       OR anonimo_id IN (
            SELECT anonimo_id FROM rastro_ligacoes
            WHERE pessoa_id = ${pessoaId}::uuid)
    ORDER BY ocorrido_em
  `
}

export type Parado = {
  anonimo_id: string
  pessoa_id: string | null
  ultima_etapa: string
  origem: string | null
  parado_desde: string
  horas_parado: number
}

/**
 * Quem chegou a uma etapa, não avançou, e já esperou tempo suficiente.
 *
 * O `horasMinimas` não é enfeite: sem ele a fila mostra quem está com a
 * página aberta neste segundo, e ligar para essa pessoa é atrapalhar uma
 * compra que já estava acontecendo.
 */
export async function paradosEm(
  etapa: Etapa,
  horasMinimas = 24,
  limite = 100,
): Promise<Parado[]> {
  const posteriores = ETAPAS.slice(ETAPAS.indexOf(etapa) + 1)
  return await getSql()<Parado[]>`
    WITH ultimo AS (
      SELECT DISTINCT ON (anonimo_id)
             anonimo_id, pessoa_id, evento, origem, ocorrido_em
      FROM rastro_eventos
      ORDER BY anonimo_id, ocorrido_em DESC
    )
    SELECT u.anonimo_id, u.pessoa_id,
           u.evento AS ultima_etapa,
           u.origem,
           u.ocorrido_em AS parado_desde,
           EXTRACT(EPOCH FROM now() - u.ocorrido_em)::int / 3600 AS horas_parado
    FROM ultimo u
    WHERE u.evento = ${etapa}
      AND u.ocorrido_em < now() - make_interval(hours => ${horasMinimas})
      AND NOT EXISTS (
        SELECT 1 FROM rastro_eventos e
        WHERE e.anonimo_id = u.anonimo_id
          AND e.evento = ANY(${posteriores as unknown as string[]})
      )
    ORDER BY u.ocorrido_em DESC
    LIMIT ${limite}
  `
}

// --- números que enchem o desenho do fluxo -------------------------------

export type NumerosDoFluxo = {
  porEvento: Record<string, number>
  porOrigem: Record<string, number>
  guia: number
  pedidos: number
  recorrentes: number
  clientes: number
}

/**
 * Tudo que o desenho precisa, em três consultas.
 *
 * Sempre contando navegador distinto, nunca evento: quem começa a triagem
 * três vezes é uma pessoa hesitando, não três pessoas — e é justamente nas
 * etapas com mais hesitação que o número inflado enganaria mais.
 */
export async function numerosDoFluxo(dias: number): Promise<NumerosDoFluxo> {
  const sql = getSql()

  const [eventos, origens, pedidos] = await Promise.all([
    sql<{ evento: string; pessoas: number }[]>`
      SELECT evento, COUNT(DISTINCT anonimo_id)::int AS pessoas
      FROM rastro_eventos
      WHERE ocorrido_em > now() - make_interval(days => ${dias})
      GROUP BY evento
    `,
    sql<{ origem: string; pessoas: number }[]>`
      SELECT origem, COUNT(DISTINCT anonimo_id)::int AS pessoas
      FROM rastro_eventos
      WHERE origem IS NOT NULL
        AND ocorrido_em > now() - make_interval(days => ${dias})
      GROUP BY origem
    `,
    sql<{ pedidos: number; recorrentes: number; clientes: number }[]>`
      SELECT
        (SELECT COUNT(DISTINCT user_id) FROM orders
          WHERE created_at > now() - make_interval(days => ${dias}))::int AS pedidos,
        (SELECT COUNT(*) FROM (
          SELECT user_id FROM orders
          WHERE created_at > now() - make_interval(days => ${dias})
          GROUP BY user_id HAVING COUNT(*) > 1) x)::int AS recorrentes,
        (SELECT COUNT(*) FROM users)::int AS clientes
    `,
  ])

  // As vendas do guia moram no outro banco, e a ficha do cliente já as junta
  // pelo e-mail. Aqui basta a contagem.
  let guia = 0
  try {
    const [linha] = await getSqlConteudo()<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM hotmart_sales
      WHERE approved_date > now() - make_interval(days => ${dias})
    `
    guia = linha?.n ?? 0
  } catch (erro) {
    console.error('rastro: não contou vendas do guia', erro)
  }

  return {
    porEvento: Object.fromEntries(eventos.map((e) => [e.evento, e.pessoas])),
    porOrigem: Object.fromEntries(origens.map((o) => [o.origem, o.pessoas])),
    guia,
    pedidos: pedidos[0]?.pedidos ?? 0,
    recorrentes: pedidos[0]?.recorrentes ?? 0,
    clientes: pedidos[0]?.clientes ?? 0,
  }
}
