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

/** Só `on` com travas liberadas justifica envio. shadow e off nunca. */
export function podeEnviarAutomaticamente(travasLiberadas: boolean): boolean {
  return modoDeEnvio() === 'on' && travasLiberadas
}
