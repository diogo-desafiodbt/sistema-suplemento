// Escrita no Rastro do Cliente.
//
// A regra que manda aqui está em `docs/arquitetura/rastro-zona-1.md`: o nome
// da etapa não pode revelar o conteúdo da decisão. É por isso que existe esta
// tradução em vez de gravar o nome do evento do funil direto — `quiz_eligible`
// diz que a pessoa foi considerada apta numa triagem de diabetes, e isso é
// leitura clínica. `triagem_concluida` diz que a triagem aconteceu, que é
// fato de navegação.
//
// Qualquer etapa nova passa pelo mesmo teste antes de entrar nesta lista.

import { cookies } from 'next/headers'
import { getSql } from '@/lib/db'

export const COOKIE_VISITANTE = 'dd_visitante'
export const COOKIE_ORIGEM = 'dd_origem'

/** Do vocabulário do funil para o vocabulário neutro do Rastro. */
const NEUTRO: Record<string, string> = {
  visita: 'visita',
  quiz_started: 'triagem_iniciada',
  quiz_completed: 'triagem_respondida',
  quiz_eligible: 'triagem_concluida',
  checkout_started: 'checkout_iniciado',
}

export function nomeNeutro(evento: string): string | null {
  return NEUTRO[evento] ?? null
}

/**
 * Grava um passo da jornada.
 *
 * Passa por função em vez de INSERT direto porque quem atende o clique é o
 * `sistema-entrada`, o serviço mais exposto daqui. Com EXECUTE ele grava; sem
 * grant de tabela ele não lê a jornada de ninguém.
 *
 * Nunca lança: o Rastro é observação, e observação que derruba a tela que
 * está observando não vale o que custa. Quem chama segue o fluxo em qualquer
 * caso.
 */
export async function registrar(
  anonimoId: string,
  evento: string,
  pessoaId?: string | null,
): Promise<void> {
  try {
    const store = await cookies()
    const origem = store.get(COOKIE_ORIGEM)?.value ?? null
    await getSql()`
      SELECT rastro_registrar(
        ${anonimoId}, ${evento}, ${origem},
        ${pessoaId ?? null}::uuid
      )
    `
  } catch (erro) {
    console.error('rastro: não gravou', { evento, erro })
  }
}

/**
 * Costura: este navegador é esta pessoa.
 *
 * Chamada no login, que é o único momento em que as duas identidades estão na
 * mesma requisição. O `ON CONFLICT` mantém a primeira ligação: se o mesmo
 * navegador entrar depois com outra conta — o marido usando o celular da
 * esposa — reescrever apagaria a atribuição da jornada inteira que levou à
 * primeira compra. Reatribuir histórico com base num login isolado erra mais
 * do que acerta.
 */
export async function costurar(
  anonimoId: string,
  pessoaId: string,
): Promise<void> {
  try {
    // A ligação e a atribuição dos eventos antigos numa transação só, dentro
    // da função: ligar sem atribuir deixa a jornada órfã com a costura já
    // feita, e a segunda tentativa não conserta porque o ON CONFLICT já
    // considera resolvido.
    await getSql()`SELECT rastro_costurar(${anonimoId}, ${pessoaId}::uuid)`
  } catch (erro) {
    console.error('rastro: não costurou', { anonimoId, erro })
  }
}
