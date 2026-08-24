import { asNumber, getSql } from '@/lib/db'
import { getSqlConteudo } from '@/lib/conteudo/db'
import type { Decisao } from '@/lib/support/decide'
import type { Triagem } from '@/lib/support/triage'

export const CATEGORIAS_LIBERADAS = [
  'guia',
  'pedido',
  'financeiro',
  'assinatura',
  'produto',
  'conta',
  'institucional',
] as const

export type CategoriaLiberada = (typeof CATEGORIAS_LIBERADAS)[number]

export type VerificacaoSaida = {
  ok: boolean
  motivo: string | null
}

export type ResultadoTravas = {
  /** Todas as travas passaram — ainda assim esta entrega NÃO envia. */
  liberado: boolean
  /** Motivos da reprovação, na ordem em que as travas falharam. */
  motivos: string[]
  /** Decisão possivelmente ajustada (ex.: vídeo inventado zerado). */
  decisao: Decisao
}

// Falso positivo aqui só manda para o Pedro, que é o lado seguro do erro.
// Falso negativo manda a IA responder sozinha um pedido de dinheiro de volta.
// Por isso a lista é larga de propósito.
const RE_PEDIDO_SENSIVEL =
  /(cancel(ar|amento|ando|a|o)|reembols(ar|o|e)|estorn(ar|o|e)|devolu(ção|cao)|devolver|dinheiro de volta|arrependiment|chargeback|desisti|quero meu dinheiro|n[ãa]o quero mais|rescis|cancela)/i

function urlSemTimestamp(url: string): string {
  const semT = url.replace(/([?&])t=\d+/g, '$1').replace(/[?&]$/, '')
  try {
    const u = new URL(semT)
    return `${u.origin}${u.pathname}${u.search}`
  } catch {
    return semT.split('&t=')[0] ?? semT
  }
}

async function humanoJaRespondeu(threadId: string): Promise<boolean> {
  const sql = getSql()
  const rows = await sql<{ n: string | number }[]>`
    SELECT COUNT(*) AS n
    FROM support_threads
    WHERE id = ${threadId}::uuid
      AND (
        status::text IN ('com_suporte', 'respondido')
        OR reviewed_by IS NOT NULL
      )
  `
  return asNumber(rows[0]?.n) > 0
}

async function houveLeituraNestaRodada(
  threadId: string,
  desde: Date,
): Promise<boolean> {
  const sql = getSql()
  const rows = await sql<{ n: string | number }[]>`
    SELECT COUNT(*) AS n
    FROM support_access_log
    WHERE thread_id = ${threadId}::uuid
      AND created_at >= ${desde.toISOString()}
      AND ferramenta <> 'resposta_automatica'
  `
  return asNumber(rows[0]?.n) > 0
}

/** Confirma que a URL existe no acervo. Link inventado → null (não escala). */
async function videoNoAcervo(
  video: { titulo: string; url: string } | null,
): Promise<{ titulo: string; url: string } | null> {
  if (!video?.url) return null
  const base = urlSemTimestamp(video.url)
  const sql = getSqlConteudo()
  const rows = await sql<{ url: string | null }[]>`
    SELECT url
    FROM aulas_trecho
    WHERE url IS NOT NULL
      AND url <> ''
      AND (
        url = ${base}
        OR ${video.url} LIKE url || '%'
        OR ${base} LIKE url || '%'
      )
    LIMIT 1
  `
  if (!rows[0]?.url) return null
  return video
}

/**
 * As nove travas. A decisão da IA é necessária, não suficiente.
 * Trava 7 (saída) vem pronta de fora — a Parte F a preenche.
 */
export async function aplicarTravas(params: {
  threadId: string
  userId: string | null
  triagem: Triagem
  decisao: Decisao
  investigacaoTruncada: boolean
  respostasAutomaticasIa: number
  /** Início desta rodada de investigação — prova de leitura no access_log. */
  acessoDesde: Date
  /**
   * O texto que o cliente escreveu, cru. Isto NÃO fere a quarentena: quem lê
   * aqui é expressão regular, não IA — não há instrução a ser obedecida.
   *
   * Existe porque `pergunta_resumida` é paráfrase da IA: o cliente escreve
   * "quero meu dinheiro de volta" e o resumo vira "cliente solicita
   * devolução do valor". Conferir só a paráfrase deixa passar pedido de
   * reembolso pela palavra que a IA escolheu não usar.
   */
  textoDoCliente?: string
  verificacaoSaida: VerificacaoSaida
}): Promise<ResultadoTravas> {
  const motivos: string[] = []
  let decisao = { ...params.decisao }

  // 1 — a própria IA pediu para escalar
  if (!decisao.pode_resolver_sozinho) {
    motivos.push(
      decisao.motivo_escalonamento?.trim() ||
        'IA marcou pode_resolver_sozinho = false',
    )
  }

  // 2 — categoria liberada (prescrição, técnico, outro ficam de fora)
  if (
    !(CATEGORIAS_LIBERADAS as readonly string[]).includes(
      params.triagem.categoria,
    )
  ) {
    motivos.push(`categoria '${params.triagem.categoria}' não está liberada`)
  }

  // 3 — cliente identificado
  if (!params.userId) {
    motivos.push('cliente não identificado')
  }

  // 4 — prova de leitura no access_log + array não vazio
  const leuDeVerdade = await houveLeituraNestaRodada(
    params.threadId,
    params.acessoDesde,
  )
  if (!leuDeVerdade) {
    motivos.push('nenhuma ferramenta registrou leitura nesta rodada')
  }
  if (decisao.dados_usados.length === 0) {
    motivos.push('dados_usados vazio')
  }

  // 5 — conversa ainda sem julgamento humano; freio de 2 respostas da IA
  if (await humanoJaRespondeu(params.threadId)) {
    motivos.push('humano já respondeu nesta conversa')
  }
  if (params.respostasAutomaticasIa >= 2) {
    motivos.push(
      'já houve 2 respostas da IA — terceira volta escala para o Pedro',
    )
  }

  // 6 — tom
  if (params.triagem.tom === 'hostil') {
    motivos.push('tom hostil')
  }

  // 7 — verificação de saída (Parte F)
  if (!params.verificacaoSaida.ok) {
    motivos.push(
      params.verificacaoSaida.motivo?.trim() ||
        'verificação de saída reprovada',
    )
  }

  // 8 — investigação truncada
  if (params.investigacaoTruncada) {
    motivos.push('investigação truncada no teto de rodadas')
  }

  // 9 — vídeo só se existir no acervo; inventado → zera, não escala
  const videoOk = await videoNoAcervo(decisao.video_sugerido)
  if (decisao.video_sugerido && !videoOk) {
    decisao = { ...decisao, video_sugerido: null }
  } else if (videoOk) {
    decisao = { ...decisao, video_sugerido: videoOk }
  }

  // Sem exceção: cancelamento / reembolso / estorno
  const textoSensivel = [
    params.textoDoCliente ?? '',
    params.triagem.pergunta_resumida,
    decisao.resposta,
  ].join('\n')
  if (RE_PEDIDO_SENSIVEL.test(textoSensivel)) {
    motivos.push('pedido sensível (cancelamento, reembolso ou estorno)')
  }

  return {
    liberado: motivos.length === 0,
    motivos,
    decisao,
  }
}
