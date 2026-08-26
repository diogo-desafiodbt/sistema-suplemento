/** Resumos seguros pra webhook_logs — evita PII/endereço em claro. */

/**
 * O evento, sem o endereço da unidade.
 *
 * Os campos são os que a Envie Agora manda de verdade — `descricao`,
 * `datahora`, `local`, `cidade` —, confirmados por eles em 26/08/2026. Antes
 * daqui procurávamos `status`, `codigo` e `data`, que não existem no retorno
 * deles: o resumo saía quase todo vazio e o registro não servia para auditar.
 *
 * Fora ficam `unidade_logradouro`, `unidade_numero` e companhia. É endereço da
 * transportadora, não do cliente, mas não precisamos dele para nada e o que
 * não guardamos não vaza.
 */
function resumirEvento(e: unknown): Record<string, unknown> | null {
  if (!e || typeof e !== 'object') return null
  const ev = e as Record<string, unknown>
  return {
    id_requisicao: ev.id_requisicao,
    descricao: ev.descricao,
    datahora: ev.datahora,
    local: ev.local,
    cidade: ev.cidade,
    finalizado: ev.finalizado,
  }
}

export function summarizeShippingWebhookPayload(
  data: unknown,
): Record<string, unknown> {
  // A lista pura é o formato que a Envie Agora empurra. Descartá-la, como era
  // antes, gravava `{raw_type:'object'}` e apagava o histórico do que eles
  // mandaram — justamente o que o registro existe para guardar.
  if (Array.isArray(data)) {
    return { eventos: data.slice(0, 20).map(resumirEvento) }
  }
  if (!data || typeof data !== 'object') {
    return { raw_type: typeof data }
  }
  const d = data as Record<string, unknown>
  return {
    id_requisicao: d.id_requisicao,
    numero_etiqueta: d.numero_etiqueta,
    numero_plp: d.numero_plp,
    valor_cobrado: d.valor_cobrado,
    eventos: Array.isArray(d.eventos)
      ? d.eventos.slice(0, 20).map(resumirEvento)
      : undefined,
  }
}

export function summarizePharmacyWebhookPayload(
  data: unknown,
): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { raw_type: typeof data }
  }
  const d = data as Record<string, unknown>
  return {
    NumeroObjeto: d.NumeroObjeto,
    CodigoPedido: d.CodigoPedido,
    Status: d.Status ?? d.status,
  }
}
