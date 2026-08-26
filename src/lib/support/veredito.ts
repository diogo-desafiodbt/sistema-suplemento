import { getSql } from '@/lib/db'

/**
 * Registra o julgamento do Pedro sobre a sugestão da IA.
 *
 * É o que transforma o modo sombra em número. Sem isto, para saber se a IA
 * está pronta seria preciso ler conversa por conversa e opinar.
 */

/**
 * Distância entre a sugestão e o que foi enviado: 0 é idêntico, 1 é nada a
 * ver. Serve para separar "aprovou como estava" de "aprovou trocando uma
 * frase" — e é a segunda que ensina, porque mostra o que faltou.
 *
 * Usa distância de edição por palavra, não por letra: trocar "boleto" por
 * "Pix" é uma diferença; escrever a mesma frase com outra vírgula não é.
 */
export function distanciaEntreTextos(a: string, b: string): number {
  const pa = a.toLowerCase().split(/\s+/).filter(Boolean)
  const pb = b.toLowerCase().split(/\s+/).filter(Boolean)
  if (pa.length === 0 && pb.length === 0) return 0
  if (pa.length === 0 || pb.length === 0) return 1

  // Levenshtein por palavra, com uma linha só na memória.
  let anterior = Array.from({ length: pb.length + 1 }, (_, i) => i)
  for (let i = 1; i <= pa.length; i++) {
    const atual = [i]
    for (let j = 1; j <= pb.length; j++) {
      const custo = pa[i - 1] === pb[j - 1] ? 0 : 1
      atual[j] = Math.min(
        atual[j - 1]! + 1,
        anterior[j]! + 1,
        anterior[j - 1]! + custo,
      )
    }
    anterior = atual
  }
  const bruta = anterior[pb.length]!
  return Math.min(1, bruta / Math.max(pa.length, pb.length))
}

export async function registrarVeredito(params: {
  threadId: string
  veredito: 'aprovada' | 'rejeitada'
  sugestao: string
  enviado: string | null
  segundos: number | null
  categoria: string | null
  origem: string | null
  observacao: string | null
  decididoPor: string
}): Promise<void> {
  const sql = getSql()
  const distancia =
    params.enviado != null
      ? distanciaEntreTextos(params.sugestao, params.enviado)
      : null
  await sql`
    INSERT INTO sugestao_veredito
      (thread_id, veredito, sugestao, enviado, distancia, segundos,
       categoria, origem, observacao, decidido_por)
    VALUES (
      ${params.threadId}::uuid, ${params.veredito}, ${params.sugestao},
      ${params.enviado}, ${distancia}, ${params.segundos},
      ${params.categoria}, ${params.origem}, ${params.observacao},
      ${params.decididoPor}::uuid
    )
  `
}
