/**
 * Chave geral do envio automático de suporte.
 *
 * off     — nunca envia (padrão; variável ausente ou estranha cai aqui)
 * shadow  — decide e grava, não envia (comparar IA × humano)
 * on      — envia quando as nove travas liberarem
 *
 * Único lugar que lê SUPORTE_ENVIO_AUTOMATICO. É a décima condição:
 * soma-se às travas, não as substitui.
 */

export type ModoEnvio = 'off' | 'shadow' | 'on'

/** Interpreta o valor cru — exportada para provar os três casos sem mutar env. */
export function interpretarModoEnvio(
  valor: string | undefined | null,
): ModoEnvio {
  if (valor == null) return 'off'
  const normalizado = valor.trim().toLowerCase()
  if (normalizado === 'shadow') return 'shadow'
  if (normalizado === 'on') return 'on'
  return 'off'
}

export function modoDeEnvio(): ModoEnvio {
  return interpretarModoEnvio(process.env.SUPORTE_ENVIO_AUTOMATICO)
}

/**
 * Cerca de destino. Nasceu como cerca de TESTE, em 25/08/2026: para exercitar
 * o envio automático sem que nenhum cliente real entrasse no experimento.
 *
 * Ausente ou vazia = NINGUÉM recebe. Para liberar geral é preciso escrever `*`
 * — um ato deliberado, não um esquecimento. É o mesmo princípio do token de
 * webhook: falta de configuração vira negativa, nunca permissão.
 *
 * Aceita lista separada por vírgula, com endereço inteiro ou `*@dominio`.
 */
export function destinoLiberado(email: string | null | undefined): boolean {
  const bruto = process.env.SUPORTE_ENVIO_ALLOWLIST?.trim()
  if (!bruto) return false
  if (bruto === '*') return true
  const alvo = email?.trim().toLowerCase()
  if (!alvo) return false
  return bruto
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .some((p) => (p.startsWith('*@') ? alvo.endsWith(p.slice(1)) : alvo === p))
}

/**
 * Só `on`, com travas liberadas E destino permitido. shadow e off nunca.
 * É a décima e a décima-primeira condição — somam-se às nove, não substituem.
 */
export function podeEnviarAutomaticamente(
  travasLiberadas: boolean,
  destino: string | null | undefined,
): boolean {
  return modoDeEnvio() === 'on' && travasLiberadas && destinoLiberado(destino)
}
