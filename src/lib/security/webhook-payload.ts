/** Resumos seguros pra webhook_logs — evita PII/endereço em claro. */

export function summarizeShippingWebhookPayload(
  data: unknown,
): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { raw_type: typeof data }
  }
  const d = data as Record<string, unknown>
  const eventos = Array.isArray(d.eventos)
    ? d.eventos.slice(0, 20).map((e) => {
        if (!e || typeof e !== 'object') return null
        const ev = e as Record<string, unknown>
        return {
          id_requisicao: ev.id_requisicao,
          status: ev.status,
          codigo: ev.codigo,
          data: ev.data,
        }
      })
    : undefined

  return {
    id_requisicao: d.id_requisicao,
    numero_etiqueta: d.numero_etiqueta,
    status: d.status,
    eventos,
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
