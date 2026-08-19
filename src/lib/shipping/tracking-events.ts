/** Chave estável pra mesclar / detectar eventos novos (id ou campos estáveis). */
export function trackingEventKey(ev: Record<string, unknown>): string {
  const id = ev.id as string | number | undefined
  if (id != null && String(id) !== '') return String(id)
  const descricao = String(ev.descricao ?? '')
  const datahora = String(ev.datahora ?? '')
  const local = ev.local != null ? String(ev.local) : ''
  return `${descricao}|${datahora}|${local}`
}

export function mergeTrackingEvents(
  existingJson: unknown,
  newEventos: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const base =
    existingJson &&
    typeof existingJson === 'object' &&
    !Array.isArray(existingJson)
      ? { ...(existingJson as Record<string, unknown>) }
      : {}

  const prev = Array.isArray(base.eventos)
    ? (base.eventos as Array<Record<string, unknown>>)
    : []
  const byId = new Map<string, Record<string, unknown>>()

  for (const ev of prev) {
    byId.set(trackingEventKey(ev), ev)
  }
  for (const ev of newEventos) {
    const key = trackingEventKey(ev)
    byId.set(key, { ...byId.get(key), ...ev })
  }

  return { ...base, eventos: Array.from(byId.values()) }
}
